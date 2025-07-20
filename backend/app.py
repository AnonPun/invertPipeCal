# 1. เรียกใช้ Library ที่จำเป็น
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
import os

# 2. ตั้งค่า Flask App
app = Flask(__name__)
CORS(app) # อนุญาตให้ Frontend เรียกหาได้

# 3. ตั้งค่าการเชื่อมต่อ Database
#    !!! สำคัญ: เอารหัส Connection String ที่ได้จาก MongoDB Atlas มาวางที่นี่ !!!
#    !!!        และเปลี่ยน <password> เป็นรหัสผ่านที่คุณสร้างไว้       !!!
MONGO_URI = "mongodb+srv://db7rma:IqQ8aRD8gWNH4cJr@cluster0.rbiosg3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
client = MongoClient(MONGO_URI)
db = client["DrainageProjectDB"] # ชื่อ Database ของคุณ
collection = db["projects"] # ชื่อ Collection (เหมือน Table)

# 4. สร้าง API Routes

# GET: สำหรับดึงข้อมูลโครงการตาม formId
@app.route("/api/projects/<string:formId>", methods=["GET"])
def get_project(formId):
    try:
        project_data = collection.find_one({"_id": formId})
        if project_data:
            return jsonify(project_data)
        else:
            return jsonify({"message": "Project not found"}), 404
    except Exception as e:
        return jsonify({"message": "Error fetching data", "error": str(e)}), 500

# POST: สำหรับบันทึก (สร้างหรืออัปเดต) ข้อมูลโครงการตาม formId
@app.route("/api/projects/<string:formId>", methods=["POST"])
def save_project(formId):
    try:
        data_to_save = request.get_json()
        
        # ใช้ update_one และ upsert=True เพื่อสร้างใหม่ถ้ายังไม่มี
        collection.update_one(
            {"_id": formId},
            {"$set": data_to_save},
            upsert=True
        )
        return jsonify({"message": "Data saved successfully"})
    except Exception as e:
        return jsonify({"message": "Error saving data", "error": str(e)}), 500

# 5. เริ่มการทำงานของเซิร์ฟเวอร์
if __name__ == "__main__":
    app.run(debug=True, port=5000)