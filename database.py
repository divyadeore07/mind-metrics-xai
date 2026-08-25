from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=True, default="Anonymous")
    age = db.Column(db.Integer, nullable=True)
    gender = db.Column(db.String(20), nullable=True)
    occupation = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    assessments = db.relationship("Assessment", backref="user", lazy=True)


class Assessment(db.Model):
    __tablename__ = "assessments"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    daily_screen_time_hours = db.Column(db.Float, nullable=False)
    
    # --- NEW COLUMNS REPLACING night_use_hours ---
    social_media_hours = db.Column(db.Float, nullable=False, default=0.0)
    sleep_hours = db.Column(db.Float, nullable=False, default=7.0)
    # ---------------------------------------------
    
    unlock_frequency = db.Column(db.Integer, nullable=False)

    sas_sv_score = db.Column(db.Integer, nullable=False)
    phq9_score = db.Column(db.Integer, nullable=False)
    gad7_score = db.Column(db.Integer, nullable=True, default=0)

    risk_level = db.Column(db.String(50), nullable=False)
    risk_probability = db.Column(db.Float, nullable=False)
    shap_explanation = db.Column(db.JSON, nullable=False)