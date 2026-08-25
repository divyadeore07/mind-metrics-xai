import io
import json
import os
import re
import csv
from flask import Response
from PIL import Image
import pandas as pd
import joblib
from flask import Flask, jsonify, render_template, request
from database import Assessment, User, db

# --- DYNAMIC OCR INITIALIZATION ---
import pytesseract

TESSERACT_PATHS = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"),
    os.path.expanduser(r"~\AppData\Local\Tesseract-OCR\tesseract.exe"),
]

tesseract_available = False
for path in TESSERACT_PATHS:
    if os.path.exists(path):
        pytesseract.pytesseract.tesseract_cmd = path
        tesseract_available = True
        break

# Secondary fallback: EasyOCR
easyocr_reader = None
try:
    import easyocr
    easyocr_reader = easyocr.Reader(['en'], gpu=False)
except Exception:
    easyocr_reader = None


app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///mental_health.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = "super-secret-key-change-in-production"

db.init_app(app)

# Load trained Machine Learning and XAI artifacts
MODEL_PATH = "models/model.pkl"
EXPLAINER_PATH = "models/explainer.pkl"
FEATURES_PATH = "models/feature_names.pkl"

if (
    os.path.exists(MODEL_PATH)
    and os.path.exists(EXPLAINER_PATH)
    and os.path.exists(FEATURES_PATH)
):
    model = joblib.load(MODEL_PATH)
    explainer = joblib.load(EXPLAINER_PATH)
    feature_names = joblib.load(FEATURES_PATH)
else:
    model, explainer, feature_names = None, None, None

with app.app_context():
    db.create_all()


# --- HTML PAGE ROUTES ---

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/assessment")
def assessment():
    return render_template("assessment.html")

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

@app.route("/admin")
def admin():
    return render_template("admin.html")


# --- HELPER: REGEX TEXT PARSER FOR SCREEN TIME METRICS ---

def parse_screen_metrics(text):
    hours = 0
    minutes = 0
    st_hm = re.search(r"(\d+)\s*h(?:ours?)?\s*(\d+)\s*m(?:in(?:utes)?)?", text, re.IGNORECASE)
    
    if st_hm:
        hours = int(st_hm.group(1))
        minutes = int(st_hm.group(2))
    else:
        st_h = re.search(r"(\d+)\s*h(?:ours?)?", text, re.IGNORECASE)
        st_m = re.search(r"(\d+)\s*m(?:in(?:utes)?)?", text, re.IGNORECASE)
        if st_h: hours = int(st_h.group(1))
        if st_m: minutes = int(st_m.group(1))

    unlock_match = re.search(r"(\d+)\s*(?:unlocks|pickups|times)", text, re.IGNORECASE)
    unlocks = int(unlock_match.group(1)) if unlock_match else 0
    parsed_screen_time = round(hours + (minutes / 60.0), 2)
    return parsed_screen_time, unlocks


# --- MULTI-MODAL DATA EXTRACTION ENDPOINT (OCR / CSV / JSON) ---

@app.route("/api/extract-usage", methods=["POST"])
def extract_usage():
    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No file uploaded."}), 400

    file = request.files["file"]
    filename = file.filename.lower()

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(file)
            screen_time = float(df["screen_time_hours"].iloc[0] if "screen_time_hours" in df.columns else 0.0)
            social_media = float(df["social_media_hours"].iloc[0] if "social_media_hours" in df.columns else 0.0)
            sleep = float(df["sleep_hours"].iloc[0] if "sleep_hours" in df.columns else 7.0)
            unlocks = int(df["unlock_frequency"].iloc[0] if "unlock_frequency" in df.columns else 0)

            return jsonify({
                "status": "success",
                "source": "csv",
                "data": {
                    "daily_screen_time_hours": screen_time,
                    "social_media_hours": social_media,
                    "sleep_hours": sleep,
                    "unlock_frequency": unlocks,
                }
            })

        elif filename.endswith(".json"):
            data = json.load(file)
            return jsonify({
                "status": "success",
                "source": "json",
                "data": {
                    "daily_screen_time_hours": float(data.get("daily_screen_time_hours", 0.0)),
                    "social_media_hours": float(data.get("social_media_hours", 0.0)),
                    "sleep_hours": float(data.get("sleep_hours", 7.0)),
                    "unlock_frequency": int(data.get("unlock_frequency", 0)),
                }
            })

        return jsonify({
            "status": "error",
            "message": "File logs supported for CSV or JSON. Screenshots are processed directly in browser.",
        }), 400

    except Exception as err:
        return jsonify({"status": "error", "message": f"Extraction failed: {str(err)}"}), 500


# --- ASSESSMENT SUBMISSION & ML/XAI INFERENCE ENDPOINT ---

@app.route("/api/assessment/submit", methods=["POST"])
def submit_assessment():
    try:
        if not model:
            return jsonify({"status": "error", "error": "ML Model is not loaded. Execute train_model.py first."}), 500

        data = request.json
        if not data:
            return jsonify({"status": "error", "error": "No input payload received."}), 400

        # 1. Silently create the User Profile in the DB to generate an ID
        new_user = User(
            name=data.get("name", "Anonymous"),
            age=int(data.get("age", 25)),
            gender=data.get("gender", "Other"),
            occupation=data.get("occupation", "Student")
        )
        db.session.add(new_user)
        db.session.commit() # This generates new_user.id

        # 2. Structure Input Feature Vector
        features_dict = {
            "age": new_user.age,
            "daily_screen_time_hours": float(data.get("daily_screen_time_hours", 0.0)),
            "social_media_hours": float(data.get("social_media_hours", 0.0)),
            "sleep_hours": float(data.get("sleep_hours", 7.0)),
            "unlock_frequency": int(data.get("unlock_frequency", 0)),
            "sas_sv_score": int(data.get("sas_sv_score", 10)),
            "phq9_score": int(data.get("phq9_score", 0)),
            "gad7_score": int(data.get("gad7_score", 0)),
        }

        df_input = pd.DataFrame([features_dict])[feature_names]

        # --- SECTIONAL ANALYTICS LOGIC ---
        
        phq = features_dict["phq9_score"]
        if phq <= 4: phq_severity = "Minimal"
        elif phq <= 9: phq_severity = "Mild"
        elif phq <= 14: phq_severity = "Moderate"
        elif phq <= 19: phq_severity = "Moderately Severe"
        else: phq_severity = "Severe"

        sas = features_dict["sas_sv_score"]
        if sas < 31: sas_severity = "Low Addiction Risk"
        elif sas <= 33: sas_severity = "Moderate Addiction Risk"
        else: sas_severity = "High Addiction Risk"

        st = features_dict["daily_screen_time_hours"]
        sm = features_dict["social_media_hours"]
        slp = features_dict["sleep_hours"]
        
        if st > 6 or slp < 5 or sm > 4: usage_severity = "Excessive Usage"
        elif st > 4 or slp < 6.5 or sm > 2: usage_severity = "Moderate Usage"
        else: usage_severity = "Healthy Usage"

        # --- COMBINED ML INFERENCE ---
        prob_high_risk = float(model.predict_proba(df_input)[0][1])
        if prob_high_risk >= 0.65:
            risk_level = "High Mental Health Risk"
        elif prob_high_risk >= 0.35:
            risk_level = "Moderate Mental Health Risk"
        else:
            risk_level = "Low Mental Health Risk"

        # --- EXPLAINABLE AI (SHAP) ---
        shap_vals = explainer.shap_values(df_input)[0]
        shap_explanation = [{"feature": feat, "impact": float(val)} for feat, val in zip(feature_names, shap_vals)]

        # --- HOLISTIC RECOMMENDATIONS ---
        recs = []
        if slp < 6.5: recs.append("Prioritize sleep: aim for at least 7-8 hours to improve cognitive recovery.")
        if sm > 2.5: recs.append("High social media use detected: try setting app limits to reduce passive scrolling.")
        if sas >= 31: recs.append("Utilize app blockers to reduce mindless scrolling triggers.")
        if phq >= 10: recs.append("Your mood scores are elevated. Consider scheduling a session with a counselor.")
        if not recs: recs.append("Maintain your current healthy digital and mental habits.")

        # Database Logging tied strictly to the newly generated user ID
        assessment = Assessment(
            user_id=new_user.id,
            daily_screen_time_hours=features_dict["daily_screen_time_hours"],
            social_media_hours=features_dict["social_media_hours"],
            sleep_hours=features_dict["sleep_hours"],
            unlock_frequency=features_dict["unlock_frequency"],
            sas_sv_score=features_dict["sas_sv_score"],
            phq9_score=features_dict["phq9_score"],
            gad7_score=features_dict["gad7_score"],
            risk_level=risk_level,
            risk_probability=round(prob_high_risk * 100, 2),
            shap_explanation=shap_explanation,
        )
        db.session.add(assessment)
        db.session.commit()

        return jsonify({
            "status": "success",
            "analytics": {
                "usage": {"severity": usage_severity, "screen_time": st, "social_media": sm, "sleep": slp, "unlocks": features_dict["unlock_frequency"]},
                "sas": {"severity": sas_severity, "score": sas},
                "phq": {"severity": phq_severity, "score": phq}
            },
            "combined_insight": {
                "risk_level": risk_level,
                "risk_probability": round(prob_high_risk * 100, 2),
                "recommendations": recs
            },
            "shap_explanation": shap_explanation,
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "error": f"Backend Error: {str(e)}"}), 500


# --- ADMIN METRICS & MONITORING ENDPOINT ---

@app.route("/api/admin/reports", methods=["GET"])
def admin_reports():
    try:
        assessments = Assessment.query.all()
        total_count = len(assessments)
        
        if total_count == 0:
            return jsonify({
                "status": "success",
                "total_assessments": 0,
                "high_risk_percentage": 0,
                "demographics": {},
                "risk_breakdown": {"Low Risk": 0, "Moderate Risk": 0, "High Risk": 0},
                "averages": {"screen_time": 0, "social_media": 0, "sleep": 0, "sas_score": 0, "phq9_score": 0},
                "occupation_comparison": {
                    "Students": {"screen_time": 0, "sas": 0, "phq": 0},
                    "Professionals": {"screen_time": 0, "sas": 0, "phq": 0}
                },
                "recent_assessments": []
            })

        # Calculate high risk percentage and risk distribution tiers
        high_risk_count = sum(1 for a in assessments if "High" in str(a.risk_level))
        high_risk_pct = round((high_risk_count / total_count) * 100, 1)

        risk_breakdown = {
            "Low Risk": sum(1 for a in assessments if "Low" in str(a.risk_level)),
            "Moderate Risk": sum(1 for a in assessments if "Moderate" in str(a.risk_level)),
            "High Risk": sum(1 for a in assessments if "High" in str(a.risk_level))
        }

        # Demographics breakdown (Occupations)
        demographics = {}
        for a in assessments:
            if a.user and a.user.occupation:
                occ = a.user.occupation
                demographics[occ] = demographics.get(occ, 0) + 1
            else:
                demographics["Unknown"] = demographics.get("Unknown", 0) + 1

        # Population averages (including new features)
        avg_screen = round(sum(a.daily_screen_time_hours for a in assessments) / total_count, 1)
        avg_social = round(sum(a.social_media_hours for a in assessments) / total_count, 1)
        avg_sleep = round(sum(a.sleep_hours for a in assessments) / total_count, 1)
        avg_sas = round(sum(a.sas_sv_score for a in assessments) / total_count, 1)
        avg_phq = round(sum(a.phq9_score for a in assessments) / total_count, 1)

        # Student vs Professional Breakdown for the comparison chart
        student_records = [a for a in assessments if a.user and a.user.occupation == "Student"]
        prof_records = [a for a in assessments if a.user and a.user.occupation == "Professional"]

        def get_sub_avg(recs, attr):
            return round(sum(getattr(r, attr, 0) for r in recs) / len(recs), 1) if recs else 0

        occupation_comparison = {
            "Students": {
                "screen_time": get_sub_avg(student_records, "daily_screen_time_hours"),
                "sas": get_sub_avg(student_records, "sas_sv_score"),
                "phq": get_sub_avg(student_records, "phq9_score")
            },
            "Professionals": {
                "screen_time": get_sub_avg(prof_records, "daily_screen_time_hours"),
                "sas": get_sub_avg(prof_records, "sas_sv_score"),
                "phq": get_sub_avg(prof_records, "phq9_score")
            }
        }

        # Recent assessments (latest 10 logs)
        recent = sorted(assessments, key=lambda x: x.id, reverse=True)[:10]
        recent_data = []
        for r in recent:
            recent_data.append({
                "id": r.id,
                "created_at": r.created_at.strftime("%Y-%m-%d %H:%M") if hasattr(r, 'created_at') and r.created_at else "N/A",
                "sas_sv_score": r.sas_sv_score,
                "phq9_score": r.phq9_score,
                "risk_level": r.risk_level or "Unknown",
                "risk_probability": round(r.risk_probability * 100, 1) if r.risk_probability <= 1 else round(r.risk_probability, 1)
            })

        return jsonify({
            "status": "success",
            "total_assessments": total_count,
            "high_risk_percentage": high_risk_pct,
            "demographics": demographics,
            "risk_breakdown": risk_breakdown,
            "averages": {
                "screen_time": avg_screen,
                "social_media": avg_social,
                "sleep": avg_sleep,
                "sas_score": avg_sas,
                "phq9_score": avg_phq
            },
            "occupation_comparison": occupation_comparison,
            "recent_assessments": recent_data
        })
    except Exception as e:
        print(f"Admin API Error: {str(e)}")
        return jsonify({"status": "error", "error": str(e)}), 500

# --- NEW: RESEARCH DATASET CSV EXPORT ENDPOINT ---

@app.route("/api/admin/export-csv", methods=["GET"])
def export_csv():
    try:
        assessments = Assessment.query.all()
        output = io.StringIO()
        writer = csv.writer(output)

        # Write CSV Header tailored for research analysis
        writer.writerow([
            "ID", "User_ID", "Timestamp", "Screen_Time_Hrs", 
            "Social_Media_Hrs", "Sleep_Hrs", "Unlocks", 
            "SAS_Score", "PHQ9_Score", "Risk_Level", "Risk_Probability"
        ])

        # Write data rows
        for a in assessments:
            writer.writerow([
                a.id,
                a.user_id,
                a.created_at.strftime("%Y-%m-%d %H:%M") if a.created_at else "N/A",
                a.daily_screen_time_hours,
                a.social_media_hours,
                a.sleep_hours,
                a.unlock_frequency,
                a.sas_sv_score,
                a.phq9_score,
                a.risk_level,
                round(a.risk_probability, 2)
            ])

        output.seek(0)
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=research_telemetry_dataset.csv"}
        )
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route("/api/user/history", methods=["GET"])
def user_history():
    try:
        records = Assessment.query.order_by(Assessment.created_at.asc()).all()
        
        history_data = {
            "dates": [r.created_at.strftime('%b %d') for r in records],
            "screen_time": [r.daily_screen_time_hours for r in records],
            "phq9": [r.phq9_score for r in records], # Fixed typo here
            "sas": [r.sas_sv_score for r in records]
        }
        return jsonify({"status": "success", "history": history_data})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

    
# --- QUICK DAILY CHECK-IN ENDPOINT ---
@app.route("/api/daily-checkin", methods=["POST"])
def daily_checkin():
    try:
        data = request.json
        if not data:
            return jsonify({"status": "error", "error": "No input payload received."}), 400
        
        # Find the latest user or create an anonymous baseline profile if none exists
        latest_user = User.query.order_by(User.id.desc()).first()
        if not latest_user:
            latest_user = User(name="Anonymous", age=25, gender="Other", occupation="Student")
            db.session.add(latest_user)
            db.session.commit()

        screen_time = float(data.get("screen_time", 0.0))
        mood = data.get("mood", "Neutral")

        # Map daily mood to a proxy score so it plots nicely on your wellbeing trend line
        mood_score_map = {"Great": 3, "Neutral": 10, "Stressed": 20}
        phq_proxy = mood_score_map.get(mood, 10)

        # Append as a lightweight mini-assessment record
        checkin_assessment = Assessment(
            user_id=latest_user.id,
            daily_screen_time_hours=screen_time,
            social_media_hours=0.0,
            sleep_hours=7.0,
            unlock_frequency=0,
            sas_sv_score=15,  # Baseline default
            phq9_score=phq_proxy,
            gad7_score=0,
            risk_level=f"Daily Check-in ({mood})",
            risk_probability=0.0,
            shap_explanation=[]
        )
        db.session.add(checkin_assessment)
        db.session.commit()

        return jsonify({"status": "success", "message": "Daily check-in logged successfully!"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)