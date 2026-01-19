import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as sfnTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export class MLPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Buckets for ML artifacts
    const mlArtifactsBucket = new s3.Bucket(this, 'MLArtifactsBucket', {
      bucketName: `bharat-ai-hub-ml-artifacts-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          expiration: cdk.Duration.days(90),
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
    });

    const trainingDataBucket = new s3.Bucket(this, 'TrainingDataBucket', {
      bucketName: `bharat-ai-hub-training-data-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // IAM Role for SageMaker
    const sagemakerRole = new iam.Role(this, 'SageMakerExecutionRole', {
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
      ],
      inlinePolicies: {
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
              ],
              resources: [
                mlArtifactsBucket.bucketArn,
                `${mlArtifactsBucket.bucketArn}/*`,
                trainingDataBucket.bucketArn,
                `${trainingDataBucket.bucketArn}/*`,
              ],
            }),
          ],
        }),
      },
    });

    // Lambda function for data preprocessing
    const dataPreprocessingLambda = new lambda.Function(this, 'DataPreprocessingLambda', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import json
import boto3
import pandas as pd
from datetime import datetime

def handler(event, context):
    """Preprocess training data for ML models"""
    s3 = boto3.client('s3')
    
    try:
        # Get input parameters
        bucket = event['bucket']
        key = event['key']
        output_key = event.get('output_key', 'processed/' + key)
        
        # Download and process data
        response = s3.get_object(Bucket=bucket, Key=key)
        data = pd.read_csv(response['Body'])
        
        # Basic preprocessing
        data = data.dropna()
        data = data.drop_duplicates()
        
        # Feature engineering based on data type
        if 'date' in data.columns:
            data['date'] = pd.to_datetime(data['date'])
            data['day_of_week'] = data['date'].dt.dayofweek
            data['month'] = data['date'].dt.month
            data['is_weekend'] = data['day_of_week'].isin([5, 6]).astype(int)
        
        # Save processed data
        processed_csv = data.to_csv(index=False)
        s3.put_object(
            Bucket=bucket,
            Key=output_key,
            Body=processed_csv,
            ContentType='text/csv'
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Data preprocessing completed',
                'output_location': f's3://{bucket}/{output_key}',
                'rows_processed': len(data),
                'timestamp': datetime.now().isoformat()
            })
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            })
        }
      `),
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        ARTIFACTS_BUCKET: mlArtifactsBucket.bucketName,
        TRAINING_DATA_BUCKET: trainingDataBucket.bucketName,
      },
    });

    // Grant S3 permissions to Lambda
    mlArtifactsBucket.grantReadWrite(dataPreprocessingLambda);
    trainingDataBucket.grantReadWrite(dataPreprocessingLambda);

    // Lambda function for model deployment
    const modelDeploymentLambda = new lambda.Function(this, 'ModelDeploymentLambda', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import json
import boto3
from datetime import datetime

def handler(event, context):
    """Deploy trained model to SageMaker endpoint"""
    sagemaker = boto3.client('sagemaker')
    
    try:
        model_name = event['model_name']
        model_data_url = event['model_data_url']
        instance_type = event.get('instance_type', 'ml.t2.medium')
        
        # Create model
        model_response = sagemaker.create_model(
            ModelName=model_name,
            PrimaryContainer={
                'Image': '763104351884.dkr.ecr.us-east-1.amazonaws.com/sklearn-inference:0.23-1-cpu-py3',
                'ModelDataUrl': model_data_url,
            },
            ExecutionRoleArn='${sagemakerRole.roleArn}'
        )
        
        # Create endpoint configuration
        endpoint_config_name = f'{model_name}-config'
        sagemaker.create_endpoint_config(
            EndpointConfigName=endpoint_config_name,
            ProductionVariants=[
                {
                    'VariantName': 'primary',
                    'ModelName': model_name,
                    'InitialInstanceCount': 1,
                    'InstanceType': instance_type,
                    'InitialVariantWeight': 1.0,
                }
            ]
        )
        
        # Create endpoint
        endpoint_name = f'{model_name}-endpoint'
        sagemaker.create_endpoint(
            EndpointName=endpoint_name,
            EndpointConfigName=endpoint_config_name
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Model deployment initiated',
                'endpoint_name': endpoint_name,
                'model_name': model_name,
                'timestamp': datetime.now().isoformat()
            })
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            })
        }
      `),
      timeout: cdk.Duration.minutes(10),
      environment: {
        SAGEMAKER_ROLE_ARN: sagemakerRole.roleArn,
      },
    });

    // Grant SageMaker permissions to deployment Lambda
    modelDeploymentLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'sagemaker:CreateModel',
          'sagemaker:CreateEndpointConfig',
          'sagemaker:CreateEndpoint',
          'sagemaker:DescribeEndpoint',
          'sagemaker:UpdateEndpoint',
          'sagemaker:DeleteEndpoint',
        ],
        resources: ['*'],
      })
    );

    // Step Functions for ML Pipeline
    const preprocessTask = new sfnTasks.LambdaInvoke(this, 'PreprocessData', {
      lambdaFunction: dataPreprocessingLambda,
      outputPath: '$.Payload',
    });

    const trainingTask = new sfnTasks.SageMakerCreateTrainingJob(this, 'TrainModel', {
      trainingJobName: sfnTasks.JsonPath.stringAt('$.training_job_name'),
      algorithmSpecification: {
        trainingImage: '763104351884.dkr.ecr.us-east-1.amazonaws.com/sklearn-training:0.23-1-cpu-py3',
        trainingInputMode: sagemaker.InputMode.FILE,
      },
      inputDataConfig: [
        {
          channelName: 'training',
          dataSource: {
            s3DataSource: {
              s3DataType: sagemaker.S3DataType.S3_PREFIX,
              s3Uri: sfnTasks.JsonPath.stringAt('$.training_data_uri'),
              s3DataDistributionType: sagemaker.S3DataDistributionType.FULLY_REPLICATED,
            },
          },
          contentType: 'text/csv',
        },
      ],
      outputDataConfig: {
        s3OutputPath: `s3://${mlArtifactsBucket.bucketName}/models/`,
      },
      resourceConfig: {
        instanceCount: 1,
        instanceType: sagemaker.TrainingInstanceType.ML_M5_LARGE,
        volumeSizeInGb: 30,
      },
      stoppingCondition: {
        maxRuntimeInSeconds: 3600,
      },
      role: sagemakerRole,
    });

    const deployTask = new sfnTasks.LambdaInvoke(this, 'DeployModel', {
      lambdaFunction: modelDeploymentLambda,
      outputPath: '$.Payload',
    });

    // Define the ML pipeline
    const definition = preprocessTask
      .next(trainingTask)
      .next(deployTask);

    const mlPipeline = new stepfunctions.StateMachine(this, 'MLPipeline', {
      definition,
      timeout: cdk.Duration.hours(2),
      logs: {
        destination: new logs.LogGroup(this, 'MLPipelineLogGroup', {
          retention: logs.RetentionDays.ONE_WEEK,
        }),
        level: stepfunctions.LogLevel.ALL,
      },
    });

    // CloudWatch Alarms
    const pipelineFailureAlarm = new cloudwatch.Alarm(this, 'PipelineFailureAlarm', {
      metric: mlPipeline.metricFailed(),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // EventBridge rule to trigger pipeline on S3 uploads
    const pipelineTriggerRule = new events.Rule(this, 'PipelineTriggerRule', {
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [trainingDataBucket.bucketName],
          },
          object: {
            key: [{ prefix: 'raw-data/' }],
          },
        },
      },
    });

    pipelineTriggerRule.addTarget(
      new targets.SfnStateMachine(mlPipeline, {
        input: events.RuleTargetInput.fromObject({
          bucket: trainingDataBucket.bucketName,
          key: events.EventField.fromPath('$.detail.object.key'),
          training_job_name: `training-job-${Date.now()}`,
          training_data_uri: `s3://${trainingDataBucket.bucketName}/processed/`,
        }),
      })
    );

    // API Gateway for ML inference
    const mlApi = new apigateway.RestApi(this, 'MLInferenceAPI', {
      restApiName: 'Bharat AI Hub ML API',
      description: 'API for ML model inference',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
      },
    });

    // Lambda function for ML inference
    const inferenceFunction = new lambda.Function(this, 'MLInferenceFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import json
import boto3
from datetime import datetime

def handler(event, context):
    """Handle ML inference requests"""
    try:
        # Parse request
        body = json.loads(event['body'])
        model_type = body.get('model_type', 'demand_forecasting')
        input_data = body.get('data', {})
        
        # Route to appropriate model endpoint
        sagemaker_runtime = boto3.client('sagemaker-runtime')
        
        endpoint_name = f'{model_type}-endpoint'
        
        response = sagemaker_runtime.invoke_endpoint(
            EndpointName=endpoint_name,
            ContentType='application/json',
            Body=json.dumps(input_data)
        )
        
        result = json.loads(response['Body'].read().decode())
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'prediction': result,
                'model_type': model_type,
                'timestamp': datetime.now().isoformat()
            })
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            })
        }
      `),
      timeout: cdk.Duration.seconds(30),
    });

    // Grant SageMaker invoke permissions
    inferenceFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sagemaker:InvokeEndpoint'],
        resources: ['*'],
      })
    );

    // Add API Gateway integration
    const inferenceIntegration = new apigateway.LambdaIntegration(inferenceFunction);
    const inferenceResource = mlApi.root.addResource('predict');
    inferenceResource.addMethod('POST', inferenceIntegration);

    // Outputs
    new cdk.CfnOutput(this, 'MLArtifactsBucketName', {
      value: mlArtifactsBucket.bucketName,
      description: 'S3 bucket for ML artifacts',
    });

    new cdk.CfnOutput(this, 'TrainingDataBucketName', {
      value: trainingDataBucket.bucketName,
      description: 'S3 bucket for training data',
    });

    new cdk.CfnOutput(this, 'MLPipelineArn', {
      value: mlPipeline.stateMachineArn,
      description: 'Step Functions ML pipeline ARN',
    });

    new cdk.CfnOutput(this, 'MLInferenceAPIUrl', {
      value: mlApi.url,
      description: 'ML Inference API Gateway URL',
    });
  }
}