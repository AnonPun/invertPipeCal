// === SCRIPT สำหรับ table1.html (อัปเดตล่าสุด: เปลี่ยนช่อง 6 เป็น Modal) ===

let areaData = [], polylineData = [];
let activeInputForRow = null; // ตัวแปรสำหรับจดจำว่า input ช่องไหนถูกคลิก

// --- 1. ส่วนของการดึงข้อมูลเมื่อหน้าเว็บโหลด ---
document.addEventListener('DOMContentLoaded', () => {
    const savedAreaData = localStorage.getItem('polygonData');
    if (savedAreaData) areaData = JSON.parse(savedAreaData);
    // ไม่ต้องเพิ่ม "--- เลือกพื้นที่ ---" อีกต่อไป เพราะจะจัดการใน Modal

    const savedPolylineData = localStorage.getItem('polylineData');
    if (savedPolylineData) polylineData = JSON.parse(savedPolylineData);

    document.getElementById('addNewTableBtn').addEventListener('click', () => new bootstrap.Modal(document.getElementById('selectTableTypeModal')).show());
    document.getElementById('selectMainPipeBtn').addEventListener('click', () => { bootstrap.Modal.getInstance(document.getElementById('selectTableTypeModal')).hide(); addTable('หลัก'); });
    document.getElementById('selectSubPipeBtn').addEventListener('click', () => { bootstrap.Modal.getInstance(document.getElementById('selectTableTypeModal')).hide(); addTable('ย่อย'); });
});

// ฟังก์ชันสร้างตารางใหม่ 
function addTable(tableType = 'หลัก') {
    const tableContainer = document.getElementById('tableContainer');
    const newTableGroup = document.createElement('div');
    newTableGroup.className = 'table-group';
    const tableGroupCount = tableContainer.querySelectorAll('.table-group').length + 1;
    newTableGroup.id = `tableGroup${tableGroupCount}`;
    const newTableId = `tableId${tableGroupCount}`;
    const tableHeading = document.createElement('h5');
    tableHeading.textContent = `${tableGroupCount}. ตารางคำนวณสำหรับท่อระบายน้ำสาย${tableType}`;
    const newTable = document.createElement('table');
    newTable.className = 'table';
    newTable.border = '1';
    newTable.id = newTableId;
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <thead>
            <tr class="tablehead" align="center"><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>11</th><th>12</th><th>13</th><th>14</th><th>15</th><th>16</th><th>17</th></tr>
            <tr class="tablehead"><th colspan="2" rowspan="2">Node</th><th rowspan="3">ท่อ<br>ระบายน้ำ<br>หมายเลข</th><th colspan="2">ความยาว</th><th colspan="4">พื้นที่ที่เกิดปริมาณน้ำท่าออกแบบ</th><th rowspan="3">สปส.<br>เฉลี่ย<br>C</th><th rowspan="3">พื้นที่รวม<br>(ตร.ม.)<br>A<sub>T</sub></th><th rowspan="3">พื้นที่สะสม</th><th colspan="3" rowspan="2">เวลา (นาที)</th><th rowspan="3">I<br>มม./ชม.</th><th rowspan="3">ปริมาณ<br>น้ำท่า<br>ออกแบบ<br>(ลบ.ม./วินาที)</th></tr>
            <tr class="tablehead"><th rowspan="2">ท่อ<br>L<br>(ม.)</th><th rowspan="2">สะสม<br>L<sub>S</sub><br>(ม.)</th><th colspan="2">พื้นที่แปลงย่อย</th><th colspan="2">ถนน</th></tr>
            <tr class="tablehead"><th>START</th><th>END</th><th>ขนาด(A<sub>1</sub>)<br>(ตร.ม.)</th><th>สปส.<br>C<sub>1</sub></th><th>ขนาด(A<sub>2</sub>)<br>(ตร.ม.)</th><th>สปส.<br>C<sub>2</sub></th><th>t<sub>0</sub></th><th>t<sub>pipe</sub></th><th>T<sub>C</sub></th></tr>
        </thead>
    `;
    newTable.appendChild(thead);
    const tbody = document.createElement('tbody');
    newTable.appendChild(tbody);
    const tableControls = document.createElement('div');
    tableControls.className = 'table-controls';
    const leftButtonsDiv = document.createElement('div');
    leftButtonsDiv.className = 'left-buttons';
    const addRowButton = document.createElement('button');
    addRowButton.className = 'btn btn-primary';
    addRowButton.textContent = 'เพิ่มแถว';
    addRowButton.onclick = () => addRow(newTableId);
    const removeRowButton = document.createElement('button');
    removeRowButton.className = 'btn btn-danger';
    removeRowButton.textContent = 'ลบแถวล่าสุด';
    removeRowButton.onclick = () => removeLastRow(newTableId);
    leftButtonsDiv.append(addRowButton, removeRowButton);
    const rightButtonsDiv = document.createElement('div');
    rightButtonsDiv.className = 'right-buttons';
    const removeTableButton = document.createElement('button');
    removeTableButton.className = 'btn btn-warning';
    removeTableButton.textContent = 'ลบตารางนี้';
    removeTableButton.onclick = () => removeTableGroup(newTableGroup.id);
    rightButtonsDiv.appendChild(removeTableButton);
    tableControls.append(leftButtonsDiv, rightButtonsDiv);
    newTableGroup.append(tableHeading, newTable, tableControls);
    tableContainer.appendChild(newTableGroup);
    addRow(newTableId);
    calculate();
}


// --- [อัปเดต] ฟังก์ชัน addRow ให้เปลี่ยนช่อง 6 เป็น Input ที่เรียก Modal ---
function addRow(tableId) {
    const table = document.getElementById(tableId)?.querySelector('tbody');
    if (!table) return;

    const newRow = table.insertRow();
    const cellConfigs = [
        { type: 'text', placeholder: 'Start', readOnly: true },
        { type: 'text', placeholder: 'End', readOnly: true },
        { type: 'text', placeholder: 'คลิกเพื่อเลือก', readOnly: true, isLengthSelector: true },
        { type: 'number', placeholder: 'L', readOnly: true },
        { type: 'number', readOnly: true },
        // Codenew: เปลี่ยน config ช่อง 6 (index 5)
        { type: 'number', placeholder: 'คลิกเพื่อเลือก', readOnly: true, isAreaSelector: true },
        { type: 'number', placeholder: 'C1' },
        { type: 'number', placeholder: 'A2' },
        { type: 'number', placeholder: 'C2' },
        { type: 'number', readOnly: true },
        { type: 'number', readOnly: true },
        { type: 'number', readOnly: true },
        { type: 'number', readOnly: true, value: (15).toFixed(2) },
        { type: 'number', readOnly: true },
        { type: 'number', readOnly: true },
        { type: 'number', readOnly: true },
        { type: 'number', readOnly: true }
    ];

    cellConfigs.forEach(config => {
        const cell = newRow.insertCell();
        const element = document.createElement('input');
        element.type = config.type;
        element.placeholder = config.placeholder || '';
        if (config.value) element.value = config.value;

        if (config.readOnly) {
            element.readOnly = true;
            element.style.backgroundColor = '#f0f0f0';
            element.style.cursor = 'pointer'; // ทำให้เป็นรูปมือเมื่อชี้

            if (config.isLengthSelector) {
                element.addEventListener('click', (event) => openLengthSelectionModal(event.target));
            }
            // Codenew: เพิ่ม event listener สำหรับ Area Selector
            if (config.isAreaSelector) {
                element.addEventListener('click', (event) => openAreaSelectionModal(event.target));
            }
        } else {
            element.addEventListener('input', calculate);
        }
        element.className = 'form-control';
        cell.appendChild(element);
    });
    calculate();
}

// --- [อัปเดต] ฟังก์ชันสำหรับเปิด Modal และกรอกข้อมูลท่อ ---
function openLengthSelectionModal(inputElement) {
    activeInputForRow = inputElement;
    const listContainer = document.getElementById('length-list-container');
    listContainer.innerHTML = '';

    polylineData.forEach(item => {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'list-group-item list-group-item-action';
        a.textContent = item.pipeId;

        a.addEventListener('click', (e) => {
            e.preventDefault();
            const currentRow = activeInputForRow.closest('tr');
            currentRow.cells[0].querySelector('input').value = item.startNode;
            currentRow.cells[1].querySelector('input').value = item.endNode;
            activeInputForRow.value = item.pipeId;
            currentRow.cells[3].querySelector('input').value = item.value;
            bootstrap.Modal.getInstance(document.getElementById('lengthSelectionModal')).hide();
            calculate();
        });
        listContainer.appendChild(a);
    });

    new bootstrap.Modal(document.getElementById('lengthSelectionModal')).show();
}

// --- [Codenew] ฟังก์ชันใหม่สำหรับเปิด Modal และจัดการการเลือกพื้นที่ ---
function openAreaSelectionModal(inputElement) {
    activeInputForRow = inputElement; // จดจำ input ที่ถูกคลิก (ช่อง A1)
    const listContainer = document.getElementById('area-list-container');
    listContainer.innerHTML = ''; // ล้างรายการเก่า

    // สร้างรายการจากข้อมูล areaData ที่โหลดมา
    areaData.forEach(item => {
        // ไม่ต้องแสดงตัวเลือก "--- เลือกพื้นที่ ---" ที่มีค่าเป็น 0
        if (item.value == 0) return;

        const a = document.createElement('a');
        a.href = '#';
        a.className = 'list-group-item list-group-item-action';
        a.textContent = item.name; // แสดงชื่อเต็ม เช่น "A1 = 123.45 ตร.ม."

        a.addEventListener('click', (e) => {
            e.preventDefault();
            // นำค่าตัวเลขของพื้นที่ไปใส่ใน input ที่คลิก
            activeInputForRow.value = item.value;
            // ซ่อน Modal
            bootstrap.Modal.getInstance(document.getElementById('areaSelectionModal')).hide();
            // คำนวณใหม่
            calculate();
        });
        listContainer.appendChild(a);
    });

    // แสดง Modal
    new bootstrap.Modal(document.getElementById('areaSelectionModal')).show();
}


// --- [อัปเดต] ฟังก์ชัน calculate ให้ดึงค่า A1 จาก input แทน select ---
function calculate() {
    document.querySelectorAll('.table').forEach(table => {
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        let prevLs = 0, prevAccArea = 0, prevTc = 0;
        for (let i = 0; i < tbody.rows.length; i++) {
            const row = tbody.rows[i];
            const cells = row.cells;
            
            const L = parseFloat(cells[3].querySelector('input').value) || 0;
            // Codenew: เปลี่ยนจาก 'select' เป็น 'input' สำหรับ A1
            const A1 = parseFloat(cells[5].querySelector('input').value) || 0;
            const C1 = parseFloat(cells[6].querySelector('input').value) || 0;
            const A2 = parseFloat(cells[7].querySelector('input').value) || 0;
            const C2 = parseFloat(cells[8].querySelector('input').value) || 0;
            const t0 = parseFloat(cells[12].querySelector('input').value) || 0;

            const Ls = prevLs + L;
            const AT = A1 + A2;
            const avgC = AT === 0 ? 0 : (A1 * C1 + A2 * C2) / AT;
            const accArea = prevAccArea + AT;
            const pipeVelocity = 0.75;
            const tpipe = L > 0 ? L / (pipeVelocity * 60) : 0;
            const Tc = (i === 0 ? t0 : prevTc) + tpipe;
            const I = Tc > 0 ? 6442.94 / Math.pow(37 + Tc, 0.975335) : 0;
            const Q = (avgC * I * accArea) / 3600000;

            cells[4].querySelector('input').value = Ls.toFixed(2);
            cells[9].querySelector('input').value = avgC.toFixed(3);
            cells[10].querySelector('input').value = AT.toFixed(2);
            cells[11].querySelector('input').value = accArea.toFixed(2);
            cells[13].querySelector('input').value = tpipe.toFixed(2);
            cells[14].querySelector('input').value = Tc.toFixed(2);
            cells[15].querySelector('input').value = I.toFixed(2);
            cells[16].querySelector('input').value = Q.toFixed(3);
            
            prevLs = Ls;
            prevAccArea = accArea;
            prevTc = Tc;
        }
    });
}
// ฟังก์ชันสำหรับลบแถวสุดท้ายออกจากตารางที่ระบุ
function removeLastRow(tableId) {
    const table = document.getElementById(tableId);
    if (!table) {
        console.error(`ไม่พบตารางที่มี ID ${tableId}`);
        return;
    }
    const tbody = table.querySelector('tbody');
    const rowCount = tbody.rows.length;
    if (rowCount > 0) {
        tbody.deleteRow(rowCount - 1);
        calculate(); // เรียกคำนวณหลังจากลบแถว
    } else {
        alert('ไม่มีแถวให้ลบ!');
    }
}

// ฟังก์ชันสำหรับลบ group ของตาราง
function removeTableGroup(tableGroupId) {
    const tableGroup = document.getElementById(tableGroupId);
    if (!tableGroup) {
        console.error(`ไม่พบกลุ่มตารางที่มี ID ${tableGroupId}`);
        return;
    }
    tableGroup.remove(); // ใช้ .remove() ง่ายกว่า
    updateTableNumbers(); // เรียกอัปเดตเลขตาราง
    calculate();
}

// ฟังก์ชันสำหรับอัปเดตหมายเลขหัวเรื่องและ ID ของตารางทั้งหมด
function updateTableNumbers() {
    const tableGroups = document.querySelectorAll('.table-group');
    tableGroups.forEach((group, index) => {
        const newIndex = index + 1;
        const newTableId = `tableId${newIndex}`;
        const newGroupId = `tableGroup${newIndex}`;

        // อัปเดต ID ของ group
        group.id = newGroupId;

        // อัปเดตหัวเรื่องของตาราง
        const tableHeading = group.querySelector('h5');
        if (tableHeading) {
            // ดึงประเภทเดิมของตารางจากข้อความหัวเรื่อง
            const currentText = tableHeading.textContent;
            let tableType = 'หลัก';
            if (currentText.includes('สายย่อย')) {
                tableType = 'ย่อย';
            }
            tableHeading.textContent = `${newIndex}. ตารางคำนวณสำหรับท่อระบายน้ำสาย${tableType}`;
        }
        
        // อัปเดต ID ของตาราง
        const table = group.querySelector('table');
        if (table) {
            table.id = newTableId;
        }

        // อัปเดต onclick ของปุ่มควบคุม
        const addRowButton = group.querySelector('.btn-primary');
        if (addRowButton) {
            addRowButton.onclick = () => addRow(newTableId);
        }
        const removeRowButton = group.querySelector('.btn-danger');
        if (removeRowButton) {
            removeRowButton.onclick = () => removeLastRow(newTableId);
        }
        const removeTableButton = group.querySelector('.btn-warning');
        if (removeTableButton) {
            removeTableButton.onclick = () => removeTableGroup(newGroupId);
        }
    });
}

// --- ส่วนจัดการ Modal ยืนยันการใช้ค่าเดิม ---
let currentRowForModal = null; // ตัวแปร Global

// ฟังก์ชันสำหรับแสดง Modal
function showAverageModal(row) {
    currentRowForModal = row;
    const calcModal = new bootstrap.Modal(document.getElementById('calcModal'));
    calcModal.show();
}

// Event listener สำหรับปุ่ม "ยืนยัน" ใน Modal
// (หมายเหตุ: Modal นี้ไม่ได้ใช้แล้วในการทำงานล่าสุด แต่ใส่โค้ดไว้เผื่อต้องการกลับไปใช้)
document.getElementById('modalConfirmBtn')?.addEventListener('click', () => {
    if (currentRowForModal) {
        const tbody = currentRowForModal.closest('tbody');
        const currentRowIndex = currentRowForModal.rowIndex - 1;

        if (currentRowIndex > 0) {
            const prevRow = tbody.rows[currentRowIndex - 1];

            // ดึงค่าจากแถวก่อนหน้า (รองรับทั้ง select และ input)
            const prevA1 = parseFloat(prevRow.cells[5].querySelector('input').value) || 0;
            const prevC1 = parseFloat(prevRow.cells[6].querySelector('input').value) || 0;
            const prevA2 = parseFloat(prevRow.cells[7].querySelector('input').value) || 0;
            const prevC2 = parseFloat(prevRow.cells[8].querySelector('input').value) || 0;

            // กำหนดค่าให้แถวปัจจุบัน
            currentRowForModal.cells[5].querySelector('input').value = prevA1;
            currentRowForModal.cells[6].querySelector('input').value = prevC1;
            currentRowForModal.cells[7].querySelector('input').value = prevA2;
            currentRowForModal.cells[8].querySelector('input').value = prevC2;
        }
    }
    const modal = bootstrap.Modal.getInstance(document.getElementById('calcModal'));
    if (modal) {
        modal.hide();
    }
    calculate(); // เรียกคำนวณหลังจากเฉลี่ยค่า
});