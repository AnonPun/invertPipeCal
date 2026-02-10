from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import json
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from datetime import datetime
from sqlalchemy import func
import re
import os

app = Flask(__name__)
print(f"Running from: {os.path.abspath(__file__)}")
print("--------------------------------------------------")
print("   STARTING APP FROM E:\\InvertOnline (PATCHED)   ")
print("--------------------------------------------------")
app.secret_key = 'my_secret_key'
bcrypt = Bcrypt(app)

# === Config Database ===
# Use absolute path to ensure we target instance/users.db
basedir = os.path.abspath(os.path.dirname(__file__))
instance_path = os.path.join(basedir, 'instance')
db_path = os.path.join(instance_path, 'users.db')

if not os.path.exists(instance_path):
    os.makedirs(instance_path)

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# ... (Rest of code)



@app.before_request
def log_request_info():
    print(f"Incoming Request: {request.method} {request.path}", flush=True)

# Model for Users
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    # เพิ่ม field ใหม่สำหรับเก็บข้อมูลส่วนตัว
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    position = db.Column(db.String(100), nullable=False)
    position_level = db.Column(db.String(100), nullable=False)
    department = db.Column(db.String(100), nullable=False)
    office = db.Column(db.String(100), nullable=False)
    division = db.Column(db.String(100), nullable=False)
    section = db.Column(db.String(100), nullable=False)
    section_number = db.Column(db.Integer, nullable=True) # Added section_number
    
# Model for Projects
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
    # Store JSON data as Text
    cal_data = db.Column(db.Text) 
    invert_data = db.Column(db.Text)
    map_data = db.Column(db.Text)
    design_data = db.Column(db.Text)
    # Foreign key to User table
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('projects', lazy=True))

# Run this once to create the database
with app.app_context():
    db.create_all()
    # Migration hack for existing databases without these columns
    # Migration hack for existing databases without these columns
    import sqlite3
    
    def patch_db(db_path):
         if not os.path.exists(db_path):
             return
         print(f"Attempting to patch {db_path}...")
         try:
            with sqlite3.connect(db_path) as conn:
                cursor = conn.cursor()
                try:
                    cursor.execute("ALTER TABLE project ADD COLUMN cal_data TEXT")
                    print(f"- Added cal_data column to {db_path}")
                except Exception as e:
                    print(f"- cal_data error: {e}")
                try:
                    cursor.execute("ALTER TABLE project ADD COLUMN invert_data TEXT")
                    print(f"- Added invert_data column to {db_path}")
                except Exception as e:
                     print(f"- invert_data error: {e}")
                conn.commit()
         except Exception as e:
            print(f"Failed to connect to {db_path}: {e}")

    patch_db("users.db")
    patch_db("instance/users.db")
    db.create_all()

# === Routes ===
# สร้าง route สำหรับการล็อกอิน
@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        email = request.form['email'].strip().lower()
        password = request.form['password']

        print(f"Login attempt for: '{email}'") # Debug log

        user = User.query.filter_by(email=email).first()

        if user:
            print(f"DEBUG: User found: {user.email}")
            print(f"DEBUG: Stored hash: {user.password}")
            is_valid = bcrypt.check_password_hash(user.password, password)
            print(f"DEBUG: Password valid? {is_valid}")
            
            if is_valid:
                session['user'] = user.email
                session['user_name'] = f"{user.first_name} {user.last_name}"
                flash('เข้าสู่ระบบสำเร็จ', 'success')
                return redirect(url_for('index'))
            else:
                error = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
        else:
            print("DEBUG: User not found")
            error = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
    return render_template('login.html', error=error)

@app.route('/index')
def index():
    if 'user' not in session:
        return redirect(url_for('login'))
    
    current_user = User.query.filter_by(email=session['user']).first()
    
    # Pagination parameters
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 5, type=int)
    search_query = request.args.get('q', '').strip()
    
    # Base query for user's projects
    query = Project.query.filter_by(user_id=current_user.id)
    
    # Apply search filter if query exists
    if search_query:
        # Search in project_name or form_number
        query = query.filter(
            (Project.project_name.contains(search_query)) | 
            (Project.form_number.contains(search_query))
        )
    
    # Fetch projects with pagination
    # Pass search_query to pagination so links preserve it (handled in template usually, but we need the objects)
    pagination = query.order_by(Project.id.desc()).paginate(page=page, per_page=per_page, error_out=False)
    projects = pagination.items
    
    return render_template('index.html', user=session['user'], projects=projects, pagination=pagination, per_page=per_page, search_query=search_query)

@app.route('/')
def home():
    # เริ่มต้นที่หน้า 'main'
    return redirect(url_for('main'))

@app.route('/main')
def main():
    # Pagination parameters
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 5, type=int)
    search_query = request.args.get('q', '').strip()
    
    # Query all projects
    query = Project.query
    
    # Apply search filter
    if search_query:
        query = query.filter(
            (Project.project_name.contains(search_query)) | 
            (Project.form_number.contains(search_query))
        )
        
    # Paginate
    pagination = query.order_by(Project.id.desc()).paginate(page=page, per_page=per_page, error_out=False)
    projects = pagination.items

    return render_template('main.html', projects=projects, pagination=pagination, per_page=per_page, search_query=search_query)

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form['email'].strip().lower()
        password = request.form['password']
        confirm_password = request.form['confirm_password']

        user_exists = User.query.filter_by(email=email).first()

        if user_exists:
            flash('อีเมลนี้มีอยู่ในระบบแล้ว', 'danger')
            return redirect(url_for('register'))
        elif password != confirm_password:
            flash('รหัสผ่านไม่ตรงกัน', 'danger')
            return redirect(url_for('register'))
        else:
            hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
            session['registration_data'] = {
                'email': email,
                'password': hashed_password
            }
            flash('อีเมลนี้สามารถใช้งานได้ กรุณากรอกข้อมูลเพิ่มเติม', 'success')
            return redirect(url_for('user_info'))
    return render_template('register.html')

@app.route('/user_info', methods=['GET', 'POST'])
def user_info():
    if 'registration_data' not in session:
        flash('กรุณาเริ่มต้นจากการสมัครสมาชิกก่อน', 'warning')
        return redirect(url_for('register'))

    if request.method == 'POST':
        first_name = request.form.get('first_name')
        last_name = request.form.get('last_name')
        position = request.form.get('position')
        position_level = request.form.get('position_level')
        department = request.form.get('department')
        office = request.form.get('office')
        division = request.form.get('division')
        section = request.form.get('section')

        if not all([first_name, last_name, position, position_level, department, office, division, section]):
             flash('กรุณากรอกข้อมูลให้ครบถ้วน', 'danger')
             return redirect(url_for('user_info'))
        
        reg_data = session['registration_data']
        
        # Determine section number
        section_number = None
        if section == "กลุ่มงานวิศวกรรมระบบระบายน้ำ 1":
            section_number = 1
        elif section == "กลุ่มงานวิศวกรรมระบบระบายน้ำ 2":
            section_number = 2
        elif section == "กลุ่มงานวิศวกรรมระบบระบายน้ำ 3":
            section_number = 3

        new_user = User(
            email=reg_data['email'],
            password=reg_data['password'],
            first_name=first_name,
            last_name=last_name,
            position=position,
            position_level=position_level,
            department=department,
            office=office,
            division=division,
            section=section,
            section_number=section_number
        )
        
        try:
            db.session.add(new_user)
            db.session.commit()
            session.pop('registration_data', None)
            flash('สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ', 'success')
            return redirect(url_for('login'))
        except Exception as e:
            print(f"Error: {e}")
            db.session.rollback()
            flash('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'danger')
            return redirect(url_for('register'))

    return render_template('userinfo.html')

@app.route('/logout')
def logout():
    session.clear()
    flash('ออกจากระบบสำเร็จ', 'info')
    return redirect(url_for('main'))

@app.route('/project_info', methods=['GET', 'POST'])
def project_info():
    if 'user' not in session:
        return redirect(url_for('login'))

    if request.method == 'POST':
        # Get data from the form
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

        # Find the current user
        current_user = User.query.filter_by(email=session['user']).first()

        # Validate required numeric fields
        try:
            if not original_level or not improved_level or not road_width:
                raise ValueError("กรุณากรอกข้อมูลตัวเลขให้ครบถ้วน")

            original_level_float = float(original_level)
            improved_level_float = float(improved_level)
            road_width_float = float(road_width)
        except ValueError:
            flash('กรุณากรอกข้อมูลตัวเลขที่ถูกต้อง', 'danger')
            return redirect(url_for('project_info'))

        # Create a new Project object and save it to the database
        new_project = Project(
            project_name=project_name,
            district=district,
            year=year,
            form_number=form_number,
            original_level=original_level_float,
            improved_level=improved_level_float,
            road_width=road_width_float,
            nearby_canal=nearby_canal,
            dredging_level=float(dredging_level.strip()) if dredging_level and dredging_level.strip() else None,
            pump_influence=pump_influence,
            user=current_user
        )
        db.session.add(new_project)
        db.session.commit()

        # Redirect to the map and table page after saving
        return redirect(url_for('map_and_table', project_id=new_project.id))

    # If it's a GET request, just show the form
    # Auto-generate form number
    current_user = User.query.filter_by(email=session['user']).first()
    suggested_form_number = ""
    suggested_year = ""

    if current_user:
        # 1. Section Number (X) - Use section_number from user profile
        if current_user.section_number:
            div_code = str(current_user.section_number)
        else:
            div_code = '0' # Default if no section number 

        # 2. Fiscal Year (YY)
        today = datetime.now()
        # Fiscal year starts Oct 1st. 
        # If today is >= Oct 1st, fiscal year is next year.
        if today.month >= 10:
            fiscal_year = today.year + 543 + 1
        else:
            fiscal_year = today.year + 543
        
        yy = str(fiscal_year)[-2:]
        suggested_year = str(fiscal_year)

        # 3. Running Number (ZZZ)
        prefix = f"{div_code}-{yy}-"
        
        # Find max form_number with this prefix
        # We need to filter by prefix and then find the max
        # This assumes form_number format is strictly maintained
        last_project = Project.query.filter(Project.form_number.like(f"{prefix}%")).order_by(Project.form_number.desc()).first()

        if last_project:
            try:
                last_running_num = int(last_project.form_number.split('-')[-1])
                next_running_num = last_running_num + 1
            except ValueError:
                next_running_num = 1
        else:
            next_running_num = 1

        zzz = f"{next_running_num:03d}"
        suggested_form_number = f"{prefix}{zzz}"

    return render_template('projectInfo.html', suggested_form_number=suggested_form_number, suggested_year=suggested_year)

# Add routes for other pages to ensure the app runs smoothly
@app.route('/map_and_table')
@app.route('/map_and_table/<int:project_id>')
def map_and_table(project_id=None):
    if 'user' not in session:
        return redirect(url_for('login'))
    
    current_user = User.query.filter_by(email=session['user']).first()

    if project_id:
        project = Project.query.get_or_404(project_id)
        if project.user_id != current_user.id:
             return redirect(url_for('index'))
    else:
        # Fallback: Load latest project if no ID provided (e.g. direct nav)
        project = Project.query.filter_by(user_id=current_user.id).order_by(Project.id.desc()).first()

    return render_template('mapAndTable.html', project=project)

@app.route('/cal_table')
@app.route('/cal_table/<int:project_id>')
def cal_table(project_id=None):
    if 'user' not in session:
        return redirect(url_for('login'))
    
    current_user = User.query.filter_by(email=session['user']).first()
    
    if project_id:
        project = Project.query.get_or_404(project_id)
        if project.user_id != current_user.id:
             return redirect(url_for('index'))
    else:
        project = Project.query.filter_by(user_id=current_user.id).order_by(Project.id.desc()).first()
        
    return render_template('calTable.html', project=project)

@app.route('/invert_cal')
@app.route('/invert_cal/<int:project_id>')
def invert_cal(project_id=None):
    if 'user' not in session:
        return redirect(url_for('login'))
    
    current_user = User.query.filter_by(email=session['user']).first()
    
    if project_id:
        project = Project.query.get_or_404(project_id)
        if project.user_id != current_user.id:
             return redirect(url_for('index'))
    else:
        project = Project.query.filter_by(user_id=current_user.id).order_by(Project.id.desc()).first()
    
    improved_level = 0
    if project:
        improved_level = project.improved_level

    return render_template('invertCal.html', improved_level=improved_level, project=project)

@app.route('/report')
@app.route('/report/<int:project_id>')
def report(project_id=None):
    # Check if mode is view or print (public access allowed)
    mode = request.args.get('mode')
    public_modes = ['view', 'print']
    
    current_user = None
    if 'user' in session:
        current_user = User.query.filter_by(email=session['user']).first()
    
    # If not in public mode and not logged in, redirect to login
    if mode not in public_modes and not current_user:
        return redirect(url_for('login'))
    
    if project_id:
        project = Project.query.get_or_404(project_id)
        # If not public mode, ensure user owns the project
        if mode not in public_modes and project.user_id != current_user.id:
            flash('คุณไม่มีสิทธิ์เข้าถึงโครงการนี้', 'danger')
            return redirect(url_for('index'))
    else:
        # Fallback to latest (only for logged in users)
        if not current_user:
             return redirect(url_for('login'))
        project = Project.query.filter_by(user_id=current_user.id).order_by(Project.id.desc()).first()
    
    return render_template('report.html', project=project, user_info=project.user, mode=mode)

@app.route('/delete_project/<int:project_id>', methods=['POST'])
def delete_project(project_id):
    if 'user' not in session:
        return redirect(url_for('login'))
    
    current_user = User.query.filter_by(email=session['user']).first()
    project = Project.query.get_or_404(project_id)
    
    if project.user_id != current_user.id:
        flash('คุณไม่มีสิทธิ์ลบโครงการนี้', 'danger')
        return redirect(url_for('index'))
        
    try:
        db.session.delete(project)
        db.session.commit()
        flash('ลบโครงการเรียบร้อยแล้ว', 'success')
    except Exception as e:
        db.session.rollback()
        flash('เกิดข้อผิดพลาดในการลบโครงการ', 'danger')
        
    return redirect(url_for('index'))

@app.route('/edit_project/<int:project_id>', methods=['GET', 'POST'])
def edit_project(project_id):
    if 'user' not in session:
        return redirect(url_for('login'))
        
    current_user = User.query.filter_by(email=session['user']).first()
    project = Project.query.get_or_404(project_id)
    
    if project.user_id != current_user.id:
        flash('คุณไม่มีสิทธิ์แก้ไขโครงการนี้', 'danger')
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        try:
            project.project_name = request.form.get('project_name')
            project.district = request.form.get('district_office')
            project.year = request.form.get('year')
            project.form_number = request.form.get('form_number')
            project.original_level = float(request.form.get('original_level'))
            project.improved_level = float(request.form.get('improved_level'))
            project.road_width = float(request.form.get('road_width'))
            project.nearby_canal = request.form.get('nearby_canal')
            d_level = request.form.get('dredging_level')
            project.dredging_level = float(d_level.strip()) if d_level and d_level.strip() else None
            project.pump_influence = request.form.get('pump_influence')
            
            db.session.commit()
            flash('บันทึกการแก้ไขเรียบร้อยแล้ว', 'success')
            return redirect(url_for('map_and_table', project_id=project.id))
        except ValueError:
             flash('กรุณากรอกข้อมูลตัวเลขที่ถูกต้อง', 'danger')
        except Exception as e:
            db.session.rollback()
            print(e)
            flash('เกิดข้อผิดพลาดในการบันทึก', 'danger')
            
    return render_template('projectInfo.html', project=project)

@app.route('/debug_db')
def debug_db():
    users = User.query.all()
    result = "<h1>Users in DB</h1><ul>"
    for user in users:
        result += f"<li>ID: {user.id}, Email: {user.email}, Hash: {user.password}</li>"
    result += "</ul>"
    return result

# === API for Project Persistence ===

@app.route('/api/save_project_data/<int:project_id>', methods=['POST'])
def save_project_data(project_id):
    if 'user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    current_user = User.query.filter_by(email=session['user']).first()
    project = Project.query.get_or_404(project_id)
    
    if project.user_id != current_user.id:
        return jsonify({'error': 'Forbidden'}), 403
        
    data = request.json
    if 'cal_data' in data:
        project.cal_data = json.dumps(data['cal_data'])
    if 'invert_data' in data:
        project.invert_data = json.dumps(data['invert_data'])
    if 'map_data' in data:
        project.map_data = json.dumps(data['map_data'])
    if 'design_data' in data:
        project.design_data = json.dumps(data['design_data'])
        
    try:
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/get_project_data/<int:project_id>')
def get_project_data(project_id):
    if 'user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    current_user = User.query.filter_by(email=session['user']).first()
    project = Project.query.get_or_404(project_id)
    
    if project.user_id != current_user.id:
        return jsonify({'error': 'Forbidden'}), 403
        
    return jsonify({
        'cal_data': json.loads(project.cal_data) if project.cal_data else None,
        'invert_data': json.loads(project.invert_data) if project.invert_data else None,
        'map_data': json.loads(project.map_data) if project.map_data else None,
        'design_data': json.loads(project.design_data) if project.design_data else None
    })

@app.route('/fix_db_now')
def fix_db_now():
    try:
        from sqlalchemy import text
        
        # Check current columns using SQLAlchemy inspection or raw SQL
        with db.engine.connect() as conn:
            # We use text() for raw SQL
            # Check for map_data
            try:
                conn.execute(text("SELECT map_data FROM project LIMIT 1"))
                map_msg = "map_data column already exists."
            except Exception:
                conn.execute(text("ALTER TABLE project ADD COLUMN map_data TEXT"))
                conn.commit()
                map_msg = "Added map_data column."
            
            # Check for design_data
            try:
                conn.execute(text("SELECT design_data FROM project LIMIT 1"))
                design_msg = "design_data column already exists."
            except Exception:
                conn.execute(text("ALTER TABLE project ADD COLUMN design_data TEXT"))
                conn.commit()
                design_msg = "Added design_data column."
                
        return f"Database Fix Applied:<br>{map_msg}<br>{design_msg}<br><br><a href='/'>Go Home</a>"
    except Exception as e:
        return f"Error fixing DB: {str(e)}"

if __name__ == '__main__':
    # Database Migration Patch
    import sqlite3
    try:
        print(f"Checking database schema at: {db_path}")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='project'")
        if not cursor.fetchone():
             print("Project table not found, skipping migration")
        else:
            cursor.execute("PRAGMA table_info(project)")
            columns = [row[1] for row in cursor.fetchall()]
            
            if 'map_data' not in columns:
                print("Patching DB: Adding map_data...")
                cursor.execute("ALTER TABLE project ADD COLUMN map_data TEXT")
                
            if 'design_data' not in columns:
                print("Patching DB: Adding design_data...")
                cursor.execute("ALTER TABLE project ADD COLUMN design_data TEXT")
                
            conn.commit()
        conn.close()
        print("DB Patching completed.")
    except Exception as e:
        print(f"DB Patching failed: {e}")

    app.run(debug=True, use_reloader=False)
