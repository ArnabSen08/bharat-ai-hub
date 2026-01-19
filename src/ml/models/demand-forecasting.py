#!/usr/bin/env python3
"""
Demand Forecasting ML Model
Uses LSTM neural networks for time-series prediction in retail
"""

import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error
import boto3
import json
import logging
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DemandForecastingModel:
    """
    LSTM-based demand forecasting model for retail inventory optimization
    """
    
    def __init__(self, sequence_length=30, features=5):
        self.sequence_length = sequence_length
        self.features = features
        self.model = None
        self.scaler = MinMaxScaler()
        self.s3_client = boto3.client('s3')
        self.sagemaker_client = boto3.client('sagemaker-runtime')
        
    def build_model(self):
        """Build LSTM neural network architecture"""
        self.model = Sequential([
            LSTM(50, return_sequences=True, input_shape=(self.sequence_length, self.features)),
            Dropout(0.2),
            LSTM(50, return_sequences=True),
            Dropout(0.2),
            LSTM(50),
            Dropout(0.2),
            Dense(25),
            Dense(1)
        ])
        
        self.model.compile(
            optimizer='adam',
            loss='mean_squared_error',
            metrics=['mae']
        )
        
        logger.info("LSTM model architecture built successfully")
        return self.model
    
    def prepare_data(self, data):
        """Prepare time series data for LSTM training"""
        # Feature engineering
        data['day_of_week'] = pd.to_datetime(data['date']).dt.dayofweek
        data['month'] = pd.to_datetime(data['date']).dt.month
        data['is_weekend'] = data['day_of_week'].isin([5, 6]).astype(int)
        data['is_holiday'] = data.get('is_holiday', 0)
        
        # Select features
        features = ['sales', 'price', 'day_of_week', 'month', 'is_weekend']
        feature_data = data[features].values
        
        # Scale features
        scaled_data = self.scaler.fit_transform(feature_data)
        
        # Create sequences
        X, y = [], []
        for i in range(self.sequence_length, len(scaled_data)):
            X.append(scaled_data[i-self.sequence_length:i])
            y.append(scaled_data[i, 0])  # Predict sales (first feature)
        
        return np.array(X), np.array(y)
    
    def train(self, data, epochs=100, batch_size=32, validation_split=0.2):
        """Train the LSTM model"""
        logger.info("Starting model training...")
        
        X, y = self.prepare_data(data)
        
        # Build model if not exists
        if self.model is None:
            self.build_model()
        
        # Train model
        history = self.model.fit(
            X, y,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=validation_split,
            verbose=1
        )
        
        logger.info("Model training completed")
        return history
    
    def predict(self, data, days_ahead=7):
        """Make demand predictions"""
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")
        
        # Prepare last sequence for prediction
        X, _ = self.prepare_data(data)
        last_sequence = X[-1].reshape(1, self.sequence_length, self.features)
        
        predictions = []
        current_sequence = last_sequence.copy()
        
        for _ in range(days_ahead):
            # Predict next value
            pred = self.model.predict(current_sequence, verbose=0)
            predictions.append(pred[0, 0])
            
            # Update sequence for next prediction
            new_row = current_sequence[0, -1].copy()
            new_row[0] = pred[0, 0]  # Update sales prediction
            
            # Shift sequence and add new prediction
            current_sequence = np.roll(current_sequence, -1, axis=1)
            current_sequence[0, -1] = new_row
        
        # Inverse transform predictions
        dummy_array = np.zeros((len(predictions), self.features))
        dummy_array[:, 0] = predictions
        predictions_scaled = self.scaler.inverse_transform(dummy_array)[:, 0]
        
        return predictions_scaled.tolist()
    
    def evaluate(self, test_data):
        """Evaluate model performance"""
        X_test, y_test = self.prepare_data(test_data)
        
        predictions = self.model.predict(X_test)
        
        # Inverse transform for evaluation
        dummy_test = np.zeros((len(y_test), self.features))
        dummy_test[:, 0] = y_test
        y_test_scaled = self.scaler.inverse_transform(dummy_test)[:, 0]
        
        dummy_pred = np.zeros((len(predictions), self.features))
        dummy_pred[:, 0] = predictions.flatten()
        predictions_scaled = self.scaler.inverse_transform(dummy_pred)[:, 0]
        
        mae = mean_absolute_error(y_test_scaled, predictions_scaled)
        mse = mean_squared_error(y_test_scaled, predictions_scaled)
        rmse = np.sqrt(mse)
        
        metrics = {
            'mae': float(mae),
            'mse': float(mse),
            'rmse': float(rmse),
            'accuracy': float(1 - (mae / np.mean(y_test_scaled)))
        }
        
        logger.info(f"Model evaluation metrics: {metrics}")
        return metrics
    
    def save_model(self, s3_bucket, model_key):
        """Save model to S3"""
        if self.model is None:
            raise ValueError("No model to save")
        
        # Save model locally first
        local_path = '/tmp/demand_forecasting_model.h5'
        self.model.save(local_path)
        
        # Upload to S3
        self.s3_client.upload_file(local_path, s3_bucket, model_key)
        logger.info(f"Model saved to s3://{s3_bucket}/{model_key}")
    
    def load_model(self, s3_bucket, model_key):
        """Load model from S3"""
        local_path = '/tmp/demand_forecasting_model.h5'
        
        # Download from S3
        self.s3_client.download_file(s3_bucket, model_key, local_path)
        
        # Load model
        self.model = tf.keras.models.load_model(local_path)
        logger.info(f"Model loaded from s3://{s3_bucket}/{model_key}")

def lambda_handler(event, context):
    """AWS Lambda handler for SageMaker endpoint"""
    try:
        # Parse input
        input_data = json.loads(event['body'])
        
        # Initialize model
        model = DemandForecastingModel()
        
        # Load pre-trained model
        model.load_model('bharat-ai-hub-models', 'demand-forecasting/model.h5')
        
        # Make prediction
        predictions = model.predict(
            pd.DataFrame(input_data['data']),
            days_ahead=input_data.get('days_ahead', 7)
        )
        
        response = {
            'statusCode': 200,
            'body': json.dumps({
                'predictions': predictions,
                'model_version': '1.0.0',
                'timestamp': datetime.now().isoformat()
            })
        }
        
        return response
        
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            })
        }

if __name__ == "__main__":
    # Example usage
    model = DemandForecastingModel()
    
    # Generate sample data
    dates = pd.date_range('2023-01-01', '2024-01-01', freq='D')
    sample_data = pd.DataFrame({
        'date': dates,
        'sales': np.random.normal(1000, 200, len(dates)),
        'price': np.random.normal(50, 10, len(dates)),
        'is_holiday': np.random.choice([0, 1], len(dates), p=[0.95, 0.05])
    })
    
    # Train model
    history = model.train(sample_data, epochs=50)
    
    # Make predictions
    predictions = model.predict(sample_data, days_ahead=14)
    print(f"14-day demand forecast: {predictions}")
    
    # Evaluate model
    metrics = model.evaluate(sample_data[-100:])  # Use last 100 days for testing
    print(f"Model performance: {metrics}")