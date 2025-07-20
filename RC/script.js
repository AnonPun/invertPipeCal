// รอให้ HTML โหลดเสร็จก่อนเริ่มทำงาน
document.addEventListener('DOMContentLoaded', () => {

    // อ้างอิงถึง element ที่ต้องใช้ในฟอร์มและส่วนแสดงผล
    const form = document.getElementById('beam-design-form');
    const fcInput = document.getElementById('fc');
    const fyInput = document.getElementById('fy');
    const bInput = document.getElementById('b');
    const hInput = document.getElementById('h');
    const coveringInput = document.getElementById('covering');
    const muInput = document.getElementById('mu');

    const asResultElem = document.getElementById('as-result');
    const statusResultElem = document.getElementById('status-result');

    // ดักจับเหตุการณ์เมื่อฟอร์มถูกส่ง (กดปุ่มคำนวณ)
    form.addEventListener('submit', (event) => {
        // ป้องกันไม่ให้หน้าเว็บโหลดใหม่
        event.preventDefault(); 

        // --- 1. อ่านและแปลงค่าจาก Input ---
        const fc = parseFloat(fcInput.value);
        const fy = parseFloat(fyInput.value);
        const b = parseFloat(bInput.value);
        const h = parseFloat(hInput.value);
        const covering = parseFloat(coveringInput.value);
        const Mu_kg_m = parseFloat(muInput.value);

        // ตรวจสอบว่า input ถูกต้องทั้งหมดหรือไม่
        if (isNaN(fc) || isNaN(fy) || isNaN(b) || isNaN(h) || isNaN(covering) || isNaN(Mu_kg_m)) {
            statusResultElem.textContent = "กรุณากรอกข้อมูลตัวเลขให้ครบทุกช่อง";
            statusResultElem.style.color = '#d9534f'; // Red
            asResultElem.textContent = '...';
            return;
        }

        // --- 2. คำนวณค่าเบื้องต้น ---
        const Mu = Mu_kg_m * 100; // แปลงหน่วย Mu จาก kg-m เป็น kg-cm
        const d = h - covering; // ความลึกประสิทธิผล (Effective Depth)
        const phi = 0.90; // ค่าแฟกเตอร์ลดกำลังสำหรับการดัด

        // --- 3. คำนวณค่าสัมประสิทธิ์ Beta 1 (β1) ---
        let beta1;
        if (fc <= 280) {
            beta1 = 0.85;
        } else {
            beta1 = 0.85 - (0.05 * ((fc - 280) / 70));
        }
        if (beta1 < 0.65) {
            beta1 = 0.65; // ค่าต่ำสุดของ beta1 คือ 0.65
        }

        // --- 4. คำนวณ Rn และ อัตราส่วนเหล็กเสริม (ρ) ---
        const Rn = Mu / (phi * b * d * d);
        let rho = (0.85 * fc / fy) * (1 - Math.sqrt(1 - (2 * Rn) / (0.85 * fc)));

        // --- 5. ตรวจสอบปริมาณเหล็กเสริมสูงสุดและต่ำสุด ---
        // ปริมาณเหล็กเสริมที่สภาวะสมดุล (Balanced)
        const rho_b = (0.85 * beta1 * fc / fy) * (6120 / (6120 + fy));
        // ปริมาณเหล็กเสริมสูงสุด (Maximum)
        const rho_max = 0.75 * rho_b;
        // ปริมาณเหล็กเสริมต่ำสุด (Minimum)
        const rho_min1 = 14 / fy;
        const rho_min2 = (0.8 * Math.sqrt(fc)) / fy;
        const rho_min = Math.max(rho_min1, rho_min2);

        // --- 6. ตัดสินใจและคำนวณ As ขั้นสุดท้าย ---
        let final_rho;
        let statusMessage = '';
        let statusColor = '#28a745'; // Green for success

        // กรณีที่ Rn สูงเกินไป ทำให้ค่าใน sqrt ติดลบ (rho เป็น NaN)
        if (isNaN(rho)) {
            final_rho = rho_max; // สมมติให้ใช้ค่าสูงสุดไปก่อน
            statusMessage = "หน้าตัดเล็กเกินไป ต้องการเหล็กเสริมรับแรงอัด!";
            statusColor = '#d9534f'; // Red
        } else if (rho > rho_max) {
            final_rho = rho_max;
            statusMessage = "เกินพิกัดเหล็กเสริมสูงสุด ต้องการเหล็กเสริมรับแรงอัด!";
            statusColor = '#d9534f'; // Red
        } else if (rho < rho_min) {
            final_rho = rho_min;
            statusMessage = "ใช้ปริมาณเหล็กเสริมขั้นต่ำ (Minimum Steel)";
            statusColor = '#f0ad4e'; // Orange for warning
        } else {
            final_rho = rho;
            statusMessage = "ผ่านการออกแบบ (Design OK)";
        }
        
        const As = final_rho * b * d;

        // --- 7. แสดงผลลัพธ์ ---
        asResultElem.textContent = As.toFixed(2); // แสดงทศนิยม 2 ตำแหน่ง
        statusResultElem.textContent = statusMessage;
        statusResultElem.style.color = statusColor;
        asResultElem.style.color = '#d9534f'; // Red for result value
    });
});