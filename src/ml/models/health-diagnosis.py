#!/usr/bin/env python3
"""
Healthcare Diagnosis ML Model
Multi-class classification for medical diagnosis using ensemble methods
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.feature_selection import SelectKBest, f_classif
import xgboost as xgb
import joblib
import boto3
import json
import logging
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class HealthDiagnosisModel:
    """
    Ensemble ML model for healthcare diagnosis prediction
    Combines Random Forest, Gradient Boosting, and XGBoost
    """
    
    def __init__(self):
        self.models = {
            'random_forest': RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                class_weight='balanced'
            ),
            'gradient_boosting': GradientBoostingClassifier(
                n_estimators=100,
                learning_rate=0.1,
                max_depth=6,
                random_state=42
            ),
            'xgboost': xgb.XGBClassifier(
                n_estimators=100,
                learning_rate=0.1,
                max_depth=6,
                random_state=42,
                eval_metric='mlogloss'
            )
        }
        
        self.scaler = StandardScaler()
        self.label_encoder = LabelEncoder()
        self.feature_selector = SelectKBest(f_classif, k=20)
        self.feature_names = None
        self.diagnosis_classes = None
        self.s3_client = boto3.client('s3')
        
    def preprocess_symptoms(self, symptoms_text):
        """Convert symptom text to feature vector"""
        # Common symptoms dictionary
        symptom_keywords = {
            'fever': ['fever', 'temperature', 'hot', 'burning'],
            'cough': ['cough', 'coughing', 'throat'],
            'headache': ['headache', 'head pain', 'migraine'],
            'fatigue': ['tired', 'fatigue', 'weakness', 'exhausted'],
            'nausea': ['nausea', 'vomiting', 'sick'],
            'diarrhea': ['diarrhea', 'loose stool', 'stomach'],
            'chest_pain': ['chest pain', 'chest', 'heart'],
            'shortness_breath': ['breath', 'breathing', 'respiratory'],
            'dizziness': ['dizzy', 'dizziness', 'lightheaded'],
            'rash': ['rash', 'skin', 'itching', 'spots'],
            'joint_pain': ['joint', 'arthritis', 'stiff'],
            'abdominal_pain': ['abdominal', 'stomach pain', 'belly'],
            'back_pain': ['back pain', 'spine', 'lower back'],
            'muscle_pain': ['muscle', 'ache', 'sore'],
            'loss_appetite': ['appetite', 'eating', 'hunger']
        }
        
        symptoms_lower = symptoms_text.lower()
        features = {}
        
        for symptom, keywords in symptom_keywords.items():
            features[symptom] = int(any(keyword in symptoms_lower for keyword in keywords))
        
        return features
    
    def prepare_features(self, data):
        """Prepare feature matrix from patient data"""
        features = []
        
        for _, row in data.iterrows():
            # Basic demographics
            feature_vector = {
                'age': row.get('age', 0),
                'gender_male': 1 if row.get('gender', '').lower() == 'male' else 0,
                'gender_female': 1 if row.get('gender', '').lower() == 'female' else 0,
            }
            
            # Process symptoms
            if 'symptoms' in row:
                symptom_features = self.preprocess_symptoms(row['symptoms'])
                feature_vector.update(symptom_features)
            
            # Medical history
            medical_conditions = ['diabetes', 'hypertension', 'heart_disease', 'asthma']
            for condition in medical_conditions:
                feature_vector[f'history_{condition}'] = int(
                    condition in str(row.get('medical_history', '')).lower()
                )
            
            # Vital signs (if available)
            vitals = ['temperature', 'blood_pressure_systolic', 'blood_pressure_diastolic', 
                     'heart_rate', 'respiratory_rate']
            for vital in vitals:
                feature_vector[vital] = row.get(vital, 0)
            
            features.append(feature_vector)
        
        return pd.DataFrame(features)
    
    def train(self, training_data):
        """Train the ensemble model"""
        logger.info("Starting healthcare diagnosis model training...")
        
        # Prepare features
        X = self.prepare_features(training_data)
        y = training_data['diagnosis']
        
        # Store feature names
        self.feature_names = X.columns.tolist()
        
        # Encode labels
        y_encoded = self.label_encoder.fit_transform(y)
        self.diagnosis_classes = self.label_encoder.classes_
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
        )
        
        # Scale features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        
        # Feature selection
        X_train_selected = self.feature_selector.fit_transform(X_train_scaled, y_train)
        X_test_selected = self.feature_selector.transform(X_test_scaled)
        
        # Train individual models
        trained_models = {}
        for name, model in self.models.items():
            logger.info(f"Training {name}...")
            model.fit(X_train_selected, y_train)
            
            # Evaluate
            train_score = model.score(X_train_selected, y_train)
            test_score = model.score(X_test_selected, y_test)
            
            logger.info(f"{name} - Train: {train_score:.3f}, Test: {test_score:.3f}")
            trained_models[name] = model
        
        self.models = trained_models
        
        # Ensemble evaluation
        ensemble_predictions = self.predict_ensemble(X_test)
        ensemble_accuracy = accuracy_score(y_test, ensemble_predictions)
        
        logger.info(f"Ensemble accuracy: {ensemble_accuracy:.3f}")
        
        return {
            'ensemble_accuracy': ensemble_accuracy,
            'individual_scores': {
                name: model.score(X_test_selected, y_test) 
                for name, model in self.models.items()
            }
        }
    
    def predict_ensemble(self, X):
        """Make ensemble predictions"""
        if not self.models:
            raise ValueError("Models not trained")
        
        # Prepare features
        if isinstance(X, pd.DataFrame):
            X_scaled = self.scaler.transform(X)
        else:
            X_scaled = self.scaler.transform(X)
        
        X_selected = self.feature_selector.transform(X_scaled)
        
        # Get predictions from all models
        predictions = []
        for name, model in self.models.items():
            pred = model.predict(X_selected)
            predictions.append(pred)
        
        # Ensemble voting (majority vote)
        predictions = np.array(predictions)
        ensemble_pred = []
        
        for i in range(predictions.shape[1]):
            votes = predictions[:, i]
            unique, counts = np.unique(votes, return_counts=True)
            majority_vote = unique[np.argmax(counts)]
            ensemble_pred.append(majority_vote)
        
        return np.array(ensemble_pred)
    
    def predict_proba_ensemble(self, X):
        """Get prediction probabilities"""
        if not self.models:
            raise ValueError("Models not trained")
        
        # Prepare features
        X_scaled = self.scaler.transform(X)
        X_selected = self.feature_selector.transform(X_scaled)
        
        # Get probabilities from all models
        all_probas = []
        for name, model in self.models.items():
            if hasattr(model, 'predict_proba'):
                proba = model.predict_proba(X_selected)
                all_probas.append(proba)
        
        # Average probabilities
        ensemble_proba = np.mean(all_probas, axis=0)
        return ensemble_proba
    
    def diagnose(self, patient_data):
        """Diagnose a single patient"""
        # Convert to DataFrame if needed
        if isinstance(patient_data, dict):
            patient_df = pd.DataFrame([patient_data])
        else:
            patient_df = patient_data
        
        # Prepare features
        X = self.prepare_features(patient_df)
        
        # Get predictions and probabilities
        predictions = self.predict_ensemble(X)
        probabilities = self.predict_proba_ensemble(X)
        
        results = []
        for i, (pred, proba) in enumerate(zip(predictions, probabilities)):
            diagnosis = self.label_encoder.inverse_transform([pred])[0]
            confidence = np.max(proba)
            
            # Get top 3 possible diagnoses
            top_indices = np.argsort(proba)[-3:][::-1]
            top_diagnoses = [
                {
                    'diagnosis': self.label_encoder.inverse_transform([idx])[0],
                    'probability': float(proba[idx])
                }
                for idx in top_indices
            ]
            
            results.append({
                'primary_diagnosis': diagnosis,
                'confidence': float(confidence),
                'top_diagnoses': top_diagnoses,
                'risk_level': 'high' if confidence > 0.8 else 'medium' if confidence > 0.6 else 'low'
            })
        
        return results[0] if len(results) == 1 else results
    
    def get_feature_importance(self):
        """Get feature importance from Random Forest"""
        if 'random_forest' not in self.models:
            return None
        
        rf_model = self.models['random_forest']
        selected_features = self.feature_selector.get_support()
        selected_feature_names = [self.feature_names[i] for i in range(len(selected_features)) if selected_features[i]]
        
        importance_dict = dict(zip(selected_feature_names, rf_model.feature_importances_))
        return sorted(importance_dict.items(), key=lambda x: x[1], reverse=True)
    
    def save_model(self, s3_bucket, model_prefix):
        """Save model components to S3"""
        import tempfile
        import os
        
        with tempfile.TemporaryDirectory() as temp_dir:
            # Save individual models
            for name, model in self.models.items():
                model_path = os.path.join(temp_dir, f'{name}.joblib')
                joblib.dump(model, model_path)
                self.s3_client.upload_file(
                    model_path, 
                    s3_bucket, 
                    f'{model_prefix}/{name}.joblib'
                )
            
            # Save preprocessing components
            scaler_path = os.path.join(temp_dir, 'scaler.joblib')
            joblib.dump(self.scaler, scaler_path)
            self.s3_client.upload_file(scaler_path, s3_bucket, f'{model_prefix}/scaler.joblib')
            
            encoder_path = os.path.join(temp_dir, 'label_encoder.joblib')
            joblib.dump(self.label_encoder, encoder_path)
            self.s3_client.upload_file(encoder_path, s3_bucket, f'{model_prefix}/label_encoder.joblib')
            
            selector_path = os.path.join(temp_dir, 'feature_selector.joblib')
            joblib.dump(self.feature_selector, selector_path)
            self.s3_client.upload_file(selector_path, s3_bucket, f'{model_prefix}/feature_selector.joblib')
        
        logger.info(f"Model saved to s3://{s3_bucket}/{model_prefix}/")

def lambda_handler(event, context):
    """AWS Lambda handler for diagnosis API"""
    try:
        # Parse input
        input_data = json.loads(event['body'])
        
        # Initialize model (in production, load from S3)
        model = HealthDiagnosisModel()
        # model.load_model('bharat-ai-hub-models', 'health-diagnosis')
        
        # Make diagnosis
        diagnosis_result = model.diagnose(input_data)
        
        response = {
            'statusCode': 200,
            'body': json.dumps({
                'diagnosis': diagnosis_result,
                'model_version': '1.0.0',
                'timestamp': datetime.now().isoformat(),
                'disclaimer': 'This is an AI-generated preliminary assessment. Please consult a healthcare professional for proper medical advice.'
            })
        }
        
        return response
        
    except Exception as e:
        logger.error(f"Diagnosis error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            })
        }

if __name__ == "__main__":
    # Example usage with sample data
    sample_data = pd.DataFrame([
        {
            'age': 35,
            'gender': 'male',
            'symptoms': 'fever, cough, headache, fatigue',
            'medical_history': 'diabetes',
            'temperature': 101.5,
            'diagnosis': 'Viral Infection'
        },
        {
            'age': 28,
            'gender': 'female',
            'symptoms': 'nausea, diarrhea, abdominal pain',
            'medical_history': '',
            'temperature': 99.2,
            'diagnosis': 'Gastroenteritis'
        }
    ])
    
    model = HealthDiagnosisModel()
    
    # Train model (with more data in practice)
    results = model.train(sample_data)
    print(f"Training results: {results}")
    
    # Test diagnosis
    test_patient = {
        'age': 42,
        'gender': 'male',
        'symptoms': 'chest pain, shortness of breath, dizziness',
        'medical_history': 'hypertension',
        'temperature': 98.6
    }
    
    diagnosis = model.diagnose(test_patient)
    print(f"Diagnosis result: {diagnosis}")