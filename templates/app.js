document.addEventListener('DOMContentLoaded', function () {
    // Codenew: ประกาศตัวแปรหลักสำหรับเก็บข้อมูลไว้ที่นี่ที่เดียว
    let areaData = [], polylineData = [];
    let activeInputForRow = null;

    // ===================================================================
    //  SECTION 1: MAP INITIALIZATION & LOGIC
    // ===================================================================
    const map = L.map('map').setView([13.754408, 100.499886], 13);

    // Base Layers
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const drawnItems = new L.FeatureGroup().addTo(map);
    const labelMarkers = new L.FeatureGroup().addTo(map);

    const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
            polygon: true,
            polyline: true,
            rectangle: false,
            circle: false,
            marker: false,
            circlemarker: false
        }
    });
    map.addControl(drawControl);

    const polygons = []; let nextPolygonId = 1;
    const polylines = []; let nextPolylineId = 1;
    const nodes = []; let nextNodeId = 1;
    const markers = []; let nextMarkerId = 1; // <-- เพิ่มบรรทัดนี้

    // --- Helper Functions ---
    function getOrCreateNode(latlng, polylineId) {
        let existingNode = nodes.find(n => n.latlng.equals(latlng, 1e-6));
        if (!existingNode) {
            const nodeLabel = `n${nextNodeId}`;
            const nodeMarker = L.marker(latlng, { opacity: 0 }).bindTooltip(nodeLabel, { permanent: true, direction: 'top', className: 'polygon-label' }).addTo(labelMarkers);
            existingNode = { id: nextNodeId, latlng: latlng, labelMarker: nodeMarker, associatedPolylineIds: [] };
            nodes.push(existingNode);
            nextNodeId++;
        }
        if (!existingNode.associatedPolylineIds.includes(polylineId)) {
            existingNode.associatedPolylineIds.push(polylineId);
        }
        return existingNode;
    }

    function removeNodeIfUnused(nodeId, polylineIdToRemove) {
        const nodeIndex = nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex === -1) return;
        const node = nodes[nodeIndex];
        node.associatedPolylineIds = node.associatedPolylineIds.filter(id => id !== polylineIdToRemove);
        if (node.associatedPolylineIds.length === 0) {
            map.removeLayer(node.labelMarker);
            nodes.splice(nodeIndex, 1);
        }
    }

    // --- Event Handlers ---
    map.on(L.Draw.Event.CREATED, function (event) {
        const layer = event.layer;
        drawnItems.addLayer(layer);
        if (event.layerType === 'polygon') {
            const geojson = layer.toGeoJSON();
            const areaSqMeters = turf.area(geojson);
            const centroid = turf.centroid(geojson);
            const [lng, lat] = centroid.geometry.coordinates;
            const polygonLabel = `A${nextPolygonId} = ${areaSqMeters.toFixed(2)} ตร.ม.`;
            const labelMarker = L.marker([lat, lng], { opacity: 0 }).bindTooltip(polygonLabel, { permanent: true, direction: 'center', className: 'polygon-label' }).addTo(labelMarkers);
            polygons.push({ id: nextPolygonId, layer: layer, labelMarker: labelMarker, geojson: geojson, area_m2: areaSqMeters });
            nextPolygonId++;
        } else if (event.layerType === 'polyline') {
            const latlngs = layer.getLatLngs();
            const currentPolylineId = nextPolylineId++;
            const lineSegments = [];
            const nodeIdsForThisPolyline = [];
            latlngs.forEach(latlng => {
                const node = getOrCreateNode(latlng, currentPolylineId);
                nodeIdsForThisPolyline.push(node.id);
            });
            for (let i = 0; i < latlngs.length - 1; i++) {
                const p1 = latlngs[i];
                const p2 = latlngs[i + 1];
                const segmentLine = turf.lineString([[p1.lng, p1.lat], [p2.lng, p2.lat]]);
                const segmentLength = turf.length(segmentLine, { units: 'kilometers' }) * 1000;
                const midpointLat = (p1.lat + p2.lat) / 2;
                const midpointLng = (p1.lng + p2.lng) / 2;
                const segmentLabel = `P${currentPolylineId}-S${i + 1} = ${segmentLength.toFixed(2)} ม.`;
                const segmentMarker = L.marker([midpointLat, midpointLng], { opacity: 0 }).bindTooltip(segmentLabel, { permanent: true, direction: 'center', className: 'polygon-label' }).addTo(labelMarkers);
                lineSegments.push({ marker: segmentMarker, length_m: segmentLength });
            }
            polylines.push({ id: currentPolylineId, layer: layer, segments: lineSegments, nodeIds: nodeIdsForThisPolyline, geojson: layer.toGeoJSON(), length_m: turf.length(layer.toGeoJSON(), { units: 'kilometers' }) * 1000 });
        } 
        updateLabels();
    });

    map.on(L.Draw.Event.EDITED, function (event) {
        const layers = event.layers;
        layers.eachLayer(function (layer) {
            // Handle Polygon Edits
            const polygonItem = polygons.find(item => item.layer === layer);
            if (polygonItem) {
                const geojson = layer.toGeoJSON();
                const areaSqMeters = turf.area(geojson);
                const centroid = turf.centroid(geojson);
                const [lng, lat] = centroid.geometry.coordinates;

                polygonItem.labelMarker.setLatLng([lat, lng]);
                polygonItem.area_m2 = areaSqMeters; // Update data directly here
                polygonItem.geojson = geojson; // Update geojson
            }

            // Handle Polyline Edits
            const polylineItem = polylines.find(item => item.layer === layer);
            if (polylineItem) {
                const oldNodeIds = [...polylineItem.nodeIds]; // Copy old node IDs
                const newLatlngs = layer.getLatLngs();

                // Clear old segments and their markers
                polylineItem.segments.forEach(seg => map.removeLayer(seg.marker));
                polylineItem.segments.length = 0;

                // Re-evaluate nodes: First, clean up associations for the current polyline from existing nodes
                oldNodeIds.forEach(nodeId => removeNodeIfUnused(nodeId, polylineItem.id));

                polylineItem.nodeIds.length = 0; // Clear old node IDs for this polyline

                // Get or create new nodes and associate them with this polyline
                newLatlngs.forEach(latlng => {
                    const node = getOrCreateNode(latlng, polylineItem.id);
                    polylineItem.nodeIds.push(node.id);
                });

                // Re-create segment labels
                for (let i = 0; i < newLatlngs.length - 1; i++) {
                    const p1 = newLatlngs[i];
                    const p2 = newLatlngs[i + 1];

                    const segmentLine = turf.lineString([[p1.lng, p1.lat], [p2.lng, p2.lat]]);
                    const segmentLength = turf.length(segmentLine, { units: 'kilometers' }) * 1000;

                    const midpointLat = (p1.lat + p2.lat) / 2;
                    const midpointLng = (p1.lng + p2.lng) / 2;

                    const segmentLabel = `P${polylineItem.id}-S${i + 1} = ${segmentLength.toFixed(2)} ม.`;
                    const segmentMarker = L.marker([midpointLat, midpointLng], { opacity: 0 })
                        .bindTooltip(segmentLabel, {
                            permanent: true,
                            direction: 'center',
                            className: 'polygon-label'
                        }).addTo(labelMarkers);

                    polylineItem.segments.push({
                        marker: segmentMarker,
                        length_m: segmentLength
                    });
                }
                polylineItem.geojson = layer.toGeoJSON();
                polylineItem.length_m = turf.length(polylineItem.geojson, { units: 'kilometers' }) * 1000;
            }
        });
        updateLabels(); // Update all labels after editing
    });;

    map.on(L.Draw.Event.DELETED, function (event) {
        const layers = event.layers;
        layers.eachLayer(function (layer) {
            // Handle Polygon Deletion
            const polygonIndex = polygons.findIndex(item => item.layer === layer);
            if (polygonIndex !== -1) {
                map.removeLayer(polygons[polygonIndex].labelMarker); // Remove label marker from map
                polygons.splice(polygonIndex, 1); // Remove from array
            }

            // Handle Polyline Deletion
            const polylineIndex = polylines.findIndex(item => item.layer === layer);
            if (polylineIndex !== -1) {
                const deletedPolyline = polylines[polylineIndex];
                // Remove all segment markers for this polyline
                deletedPolyline.segments.forEach(seg => map.removeLayer(seg.marker));

                // Clean up node associations and remove unused nodes
                deletedPolyline.nodeIds.forEach(nodeId => removeNodeIfUnused(nodeId, deletedPolyline.id));

                polylines.splice(polylineIndex, 1); // Remove polyline from array
            }
            // Codenew: เพิ่มส่วนสำหรับลบ marker
            const markerIndex = markers.findIndex(item => item.layer === layer);
            if (markerIndex !== -1) {
                markers.splice(markerIndex, 1); // ลบออกจาก array
            }
        });
        updateLabels(); // Update all labels after deletion
    });

    function updateLabels() {
        // Polygon Part
        const polygonDataForStorage = [];
        polygons.forEach((item, index) => {
            item.id = index + 1;
            const labelText = `A${item.id} = ${item.area_m2.toFixed(2)} ตร.ม.`;
            item.labelMarker.setTooltipContent(labelText);
            polygonDataForStorage.push({ name: labelText, value: item.area_m2.toFixed(2) });
        });
        localStorage.setItem('polygonData', JSON.stringify(polygonDataForStorage));
        nextPolygonId = polygons.length + 1;
        areaData = polygonDataForStorage;

        // Polyline Part
        const segmentDataForStorage = [];
        polylines.forEach((line, lineIndex) => {
            line.id = lineIndex + 1;
            line.segments.forEach((seg, segIndex) => {
                const startNodeData = nodes.find(n => n.id === line.nodeIds[segIndex]);
                const endNodeData = nodes.find(n => n.id === line.nodeIds[segIndex + 1]);
                if (startNodeData && endNodeData) {
                    const startNodeLabel = `n${startNodeData.id}`;
                    const endNodeLabel = `n${endNodeData.id}`;
                    const pipeSegmentId = `P${line.id}-S${segIndex + 1}`;

                    // Codenew: แก้ไข 2 บรรทัดนี้
                    // เปลี่ยนจาก segmentLength ที่ไม่มีอยู่จริง มาใช้ seg.length_m ที่ถูกเก็บไว้แล้ว
                    seg.marker.setTooltipContent(`${pipeSegmentId} = ${seg.length_m.toFixed(2)} ม.`);
                    segmentDataForStorage.push({ pipeId: pipeSegmentId, value: seg.length_m.toFixed(2), startNode: startNodeLabel, endNode: endNodeLabel });
                }
            });
        });
        localStorage.setItem('polylineData', JSON.stringify(segmentDataForStorage));
        nextPolylineId = polylines.length + 1;
        polylineData = segmentDataForStorage;

        // Node Part
        nodes.forEach((node, index) => {
            node.id = index + 1;
            node.labelMarker.setTooltipContent(`n${node.id}`);
        });
        nextNodeId = nodes.length + 1;
        console.log("Labels and data updated.");
    }

    // ===================================================================
    //  SECTION 2: TABLE LOGIC
    // ===================================================================

    // Load data from localStorage
    function loadInitialData() {
        const savedAreaData = localStorage.getItem('polygonData');
        if (savedAreaData) areaData = JSON.parse(savedAreaData);
        const savedPolylineData = localStorage.getItem('polylineData');
        if (savedPolylineData) polylineData = JSON.parse(savedPolylineData);
    }
    // Button listeners from table page
    document.getElementById('addNewTableBtn').addEventListener('click', () => new bootstrap.Modal(document.getElementById('selectTableTypeModal')).show());
    document.getElementById('selectMainPipeBtn').addEventListener('click', () => { bootstrap.Modal.getInstance(document.getElementById('selectTableTypeModal')).hide(); addTable('หลัก'); });
    document.getElementById('selectSubPipeBtn').addEventListener('click', () => { bootstrap.Modal.getInstance(document.getElementById('selectTableTypeModal')).hide(); addTable('ย่อย'); });

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

    function addRow(tableId) {
        const table = document.getElementById(tableId)?.querySelector('tbody');
        if (!table) return;
        const newRow = table.insertRow();
        const cellConfigs = [
            { type: 'text', placeholder: 'Start', readOnly: true },
            { type: 'text', placeholder: 'End', readOnly: true },
            { type: 'text', placeholder: 'เลือก', readOnly: true, isLengthSelector: true },
            { type: 'number', placeholder: 'ยาว', readOnly: true },
            { type: 'number', readOnly: true },
            { type: 'number', placeholder: 'เลือก', readOnly: true, isAreaSelector: true },
            { type: 'number', placeholder: 'C1', value: (0.60).toFixed(2) },
            { type: 'number', placeholder: 'A2' },
            { type: 'number', placeholder: 'C2', value: (0.90).toFixed(2) },
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
                element.style.backgroundColor = '#e9ecef'; // สีเทาปกติ
                element.style.cursor = 'pointer';

                // Codenew: ตรวจสอบว่าเป็นปุ่มเรียก Modal หรือไม่
                if (config.isLengthSelector || config.isAreaSelector) {
                    element.style.backgroundColor = '#fae3a5ff'; // Bootstrap Orange
                    element.style.color = 'black';

                    if (config.isLengthSelector) {
                        element.addEventListener('click', (event) => openLengthSelectionModal(event.target));
                    }
                    if (config.isAreaSelector) {
                        element.addEventListener('click', (event) => openAreaSelectionModal(event.target));
                    }
                }
            } else {
                element.addEventListener('input', calculate);
            }
            element.className = 'form-control';
            cell.appendChild(element);
        });
        calculate();
    }

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

                // Codenew: เปลี่ยนสีกลับเป็นเทา
                activeInputForRow.style.backgroundColor = '#e9ecef';
                activeInputForRow.style.color = 'black';

                bootstrap.Modal.getInstance(document.getElementById('lengthSelectionModal')).hide();
                calculate();
            });
            listContainer.appendChild(a);
        });
        new bootstrap.Modal(document.getElementById('lengthSelectionModal')).show();
    }

    function openAreaSelectionModal(inputElement) {
        activeInputForRow = inputElement;
        const listContainer = document.getElementById('area-list-container');
        listContainer.innerHTML = '';
        areaData.forEach(item => {
            if (item.value == 0) return;
            const a = document.createElement('a');
            a.href = '#';
            a.className = 'list-group-item list-group-item-action';
            a.textContent = item.name;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                activeInputForRow.value = item.value;

                // Codenew: เปลี่ยนสีกลับเป็นเทา
                activeInputForRow.style.backgroundColor = '#e9ecef';
                activeInputForRow.style.color = 'black';

                bootstrap.Modal.getInstance(document.getElementById('areaSelectionModal')).hide();
                calculate();
            });
            listContainer.appendChild(a);
        });
        new bootstrap.Modal(document.getElementById('areaSelectionModal')).show();
    }

    function calculate() {
        document.querySelectorAll('.table').forEach(table => {
            const tbody = table.querySelector('tbody');
            if (!tbody) return;
            let prevLs = 0, prevAccArea = 0, prevTc = 0;
            for (let i = 0; i < tbody.rows.length; i++) {
                const row = tbody.rows[i];
                const cells = row.cells;
                const L = parseFloat(cells[3].querySelector('input').value) || 0;
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

    // ===================================================================
    //  SECTION 3: LOGIC FOR TOGGLE MAP SIZE
    // ===================================================================
    const toggleBtn = document.getElementById('toggle-map-btn');
    const mapContainer = document.getElementById('map-container');
    const tableWrapper = document.getElementById('table-wrapper');
    const toggleIcon = toggleBtn.querySelector('i');

    toggleBtn.addEventListener('click', () => {
        mapContainer.classList.toggle('full-screen');
        tableWrapper.classList.toggle('hidden');

        // Codenew: เปลี่ยน class ของไอคอน และ title ของปุ่ม
        if (mapContainer.classList.contains('full-screen')) {
            toggleIcon.className = 'bi bi-fullscreen-exit'; // ไอคอน "ย่อ" ↖️↘️
            toggleBtn.title = 'ย่อแผนที่';
            toggleBtn.classList.remove('btn-light');
            toggleBtn.classList.add('btn-dark');
        } else {
            toggleIcon.className = 'bi bi-arrows-fullscreen'; // ไอคอน "ขยาย" ↘️↖️
            toggleBtn.title = 'ขยายเต็มจอ';
            toggleBtn.classList.remove('btn-dark');
            toggleBtn.classList.add('btn-light');
        }

        setTimeout(() => { map.invalidateSize(); }, 400);
    });

    loadInitialData(); // โหลดข้อมูลจาก localStorage (ถ้ามี)
    addTable('ย่อย');  // เพิ่มตารางแรกเป็น "สายย่อย" โดยอัตโนมัติ
});