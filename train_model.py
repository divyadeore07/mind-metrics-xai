import os
import joblib
import numpy as np
import pandas as pd
import shap
import matplotlib.pyplot as plt
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, classification_report

def train_and_export():
    np.random.seed(42)
    n_samples = 2000

    # Generate synthetic training features
    age = np.random.randint(16, 50, n_samples)
    screen_time = np.random.uniform(1.0, 14.0, n_samples)
    
    # NEW: Social media is typically a fraction of total screen time
    social_media = screen_time * np.random.uniform(0.1, 0.8, n_samples)
    
    # NEW: Sleep hours usually range from 4 to 10 hours
    sleep_hours = np.random.uniform(4.0, 10.0, n_samples)
    
    unlocks = np.random.randint(20, 250, n_samples)
    sas_sv = np.random.randint(10, 61, n_samples)
    phq9 = np.random.randint(0, 28, n_samples)
    gad7 = np.random.randint(0, 22, n_samples)

    df = pd.DataFrame({
        'age': age,
        'daily_screen_time_hours': screen_time,
        'social_media_hours': social_media,
        'sleep_hours': sleep_hours,
        'unlock_frequency': unlocks,
        'sas_sv_score': sas_sv,
        'phq9_score': phq9,
        'gad7_score': gad7
    })

    # Clinical risk rule target (1 = At Risk, 0 = Low Risk)
    # Target now triggers based on poor sleep (< 6.5 hours) rather than night usage
    df['risk_target'] = ((df['sas_sv_score'] >= 33) & (df['phq9_score'] >= 10) & (df['sleep_hours'] < 6.5)).astype(int)

    X = df.drop(columns=['risk_target'])
    y = df['risk_target']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # Train XGBoost
    model = XGBClassifier(n_estimators=100, max_depth=4, learning_rate=0.05, eval_metric='logloss', random_state=42)
    model.fit(X_train, y_train)

    # --- MODEL PERFORMANCE EVALUATION ---
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred)
    rec = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    roc_auc = roc_auc_score(y_test, y_prob)

    print("\n" + "="*40)
    print(" MODEL PERFORMANCE EVALUATION (TEST SET)")
    print("="*40)
    print(f" Accuracy : {acc:.4f}")
    print(f" Precision: {prec:.4f}")
    print(f" Recall   : {rec:.4f}")
    print(f" F1-Score : {f1:.4f}")
    print(f" ROC-AUC  : {roc_auc:.4f}")
    print("="*40 + "\n")

    # Initialize SHAP Explainer
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_test)

    # --- GENERATE & SAVE GLOBAL SHAP PLOT FOR RESEARCH PAPER ---
    os.makedirs('static/images', exist_ok=True)
    plt.figure(figsize=(10, 6))
    shap.summary_plot(shap_values, X_test, show=False)
    plt.title("Global Feature Importance (SHAP Values)", fontsize=12, fontweight='bold')
    plt.tight_layout()
    plt.savefig('static/images/shap_global_importance.png', dpi=300)
    plt.close()
    print("Global SHAP summary plot saved successfully to 'static/images/shap_global_importance.png'.")

    # Export to models directory
    os.makedirs('models', exist_ok=True)
    joblib.dump(model, 'models/model.pkl')
    joblib.dump(explainer, 'models/explainer.pkl')
    joblib.dump(list(X.columns), 'models/feature_names.pkl')
    
    print("Successfully trained model and exported artifacts to 'models/' directory.")

if __name__ == '__main__':
    train_and_export()