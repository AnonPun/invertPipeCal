from flask import Flask, render_template, request, redirect, url_for, session
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt


app = Flask(__name__)
app.secret_key = 'my_secret_key'
bcrypt = Bcrypt(app)

# === Config Database ===
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# === Database Model ===
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)

# เพิ่ม Model ใหม่ข้างล่างนี้
class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_name = db.Column(db.String(200), nullable=False)
    district = db.Column(db.String(100), nullable=False)
    year = db.Column(db.String(4), nullable=False)
    form_number = db.Column(db.String(50), nullable=False)
    original_level = db.Column(db.Float, nullable=False)
    improved_level = db.Column(db.Float, nullable=False)
    road_width = db.Column(db.Float, nullable=False)
    nearby_canal = db.Column(db.String(100))
    dredging_level = db.Column(db.Float)
    pump_influence = db.Column(db.String(100))
    # ความสัมพันธ์กับตาราง User
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('projects', lazy=True))

# run เฉพาะครั้งแรกเพื่อสร้าง DB:
with app.app_context():
    db.create_all()

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']

        user = User.query.filter_by(email=email).first()

        if user and bcrypt.check_password_hash(user.password, password):
            session['user'] = user.email
            return redirect('/dashboard')
        else:
            error = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
    return render_template('login.html', error=error)

@app.route('/dashboard')
def dashboard():
    if 'user' not in session:
        return redirect('/login')
    return render_template('dashboard.html', user=session['user'])

@app.route('/')
def home():
    return redirect('/login')

@app.route('/register', methods=['GET', 'POST'])
def register():
    error = None
    success = None
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        confirm_password = request.form['confirm_password']

        user_exists = User.query.filter_by(email=email).first()

        if user_exists:
            error = 'อีเมลนี้มีอยู่ในระบบแล้ว'
        elif password != confirm_password:
            error = 'รหัสผ่านไม่ตรงกัน'
        else:
            hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
            new_user = User(email=email, password=hashed_password)
            db.session.add(new_user)
            db.session.commit()
            success = 'สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ'
    return render_template('register.html', error=error, success=success)

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/login')

@app.route('/invert_info', methods=['GET', 'POST'])
def invert_info():
    print("!!! SERVER IS LOADING THE INVERT_INFO ROUTE !!!")  # <--- เพิ่มบรรทัดนี้
    if 'user' not in session:
        return redirect(url_for('login'))

    if request.method == 'POST':
        # ดึงข้อมูลจากฟอร์ม
        project_name = request.form.get('project_name')
        district = request.form.get('district_office')
        year = request.form.get('year')
        form_number = request.form.get('form_number')
        original_level = request.form.get('original_level')
        improved_level = request.form.get('improved_level')
        road_width = request.form.get('road_width')
        nearby_canal = request.form.get('nearby_canal')
        dredging_level = request.form.get('dredging_level')
        pump_influence = request.form.get('pump_influence')

        # ค้นหาผู้ใช้ปัจจุบัน
        current_user = User.query.filter_by(email=session['user']).first()

        # สร้าง Object ใหม่และบันทึกลง DB
        new_project = Project(
            project_name=project_name,
            district=district,
            year=year,
            form_number=form_number,
            original_level=float(original_level),
            improved_level=float(improved_level),
            road_width=float(road_width),
            nearby_canal=nearby_canal,
            dredging_level=float(dredging_level) if dredging_level else None,
            pump_influence=pump_influence,
            user=current_user
        )
        db.session.add(new_project)
        db.session.commit()

        # หลังจากบันทึกสำเร็จ ให้ไปหน้าคำนวณพื้นที่
        return redirect(url_for('map_and_table'))

    # ถ้าเป็น GET request ก็ให้แสดงหน้าฟอร์มปกติ
    return render_template('invertInfo.html')

# เพิ่ม Route สำหรับหน้าอื่นๆ เพื่อให้แอปทำงานได้ต่อเนื่อง
@app.route('/map_and_table')
def map_and_table():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('mapAndTable.html')

@app.route('/cal_table')
def cal_table():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('calTable.html')

@app.route('/invert_cal')
def invert_cal():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('invertCal.html')

@app.route('/manual')
def manual():
    if 'user' not in session:
        return redirect(url_for('login'))
    return render_template('manual.html')

if __name__ == '__main__':
    app.run(debug=True)
