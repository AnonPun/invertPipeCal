document.addEventListener('DOMContentLoaded', function () {
    // Codenew: ประกาศตัวแปรหลักสำหรับเก็บข้อมูลไว้ที่นี่ที่เดียว
    let areaData = [], polylineData = [];
    let activeInputForRow = null;

    // ===================================================================
    //  SECTION 1: MAP INITIALIZATION & LOGIC
    // ===================================================================
    // Base Layers
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    });

    const googleStreets = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    const googleHybrid = L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    const googleTerrain = L.tileLayer('http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    const map = L.map('map', {
        center: [13.754408, 100.499886],
        zoom: 13,
        layers: [googleStreets]
    });

    const baseLayers = {
        "Google ถนน": googleStreets,
        "Google ดาวเทียม": googleHybrid,
        "Google ภูมิประเทศ": googleTerrain,
        "OpenStreetMap": osmLayer
    };

    L.control.layers(baseLayers).addTo(map);

    const drawnItems = new L.FeatureGroup().addTo(map);
    const labelMarkers = new L.FeatureGroup().addTo(map);

    const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
            polygon: {
                shapeOptions: {
                    color: '#FF9900'
                },
                guideLayers: [drawnItems],
                snapDistance: 20,
                snapVertices: true
            },
            polyline: {
                shapeOptions: {
                    color: '#0000CC'
                },
                guideLayers: [drawnItems],
                snapDistance: 20,
                snapVertices: true
            },
            rectangle: false,
            circle: false,
            marker: false,
            circlemarker: false
        }
    });
    map.addControl(drawControl);

    // --- Search Control (Geocoder) ---
    // Use OSM Nominatim by default
    L.Control.geocoder({
        defaultMarkGeocode: false,
        placeholder: 'ค้นหา...'
    })
        .on('markgeocode', function (e) {
            var bbox = e.geocode.bbox;
            var poly = L.polygon([
                bbox.getSouthEast(),
                bbox.getNorthEast(),
                bbox.getNorthWest(),
                bbox.getSouthWest()
            ]);
            map.fitBounds(poly.getBounds());
        })
        .addTo(map);

    const polygons = []; let nextPolygonId = 1;
    const polylines = []; let nextPolylineId = 1;
    const nodes = []; let nextNodeId = 1;
    const markers = []; let nextMarkerId = 1; // <-- เพิ่มบรรทัดนี้

    // --- Helper Functions ---
    function getOrCreateNode(latlng, polylineId) {
        let existingNode = nodes.find(n => n.latlng.equals(latlng, 1e-6));
        if (!existingNode) {
            const nodeLabel = `${nextNodeId}`; // Use number only, no 'n' prefix
            const nodeMarker = L.circleMarker(latlng, {
                radius: 6,
                color: '#3388ff',
                fillColor: '#ffffff',
                fillOpacity: 1,
                weight: 2
            }).bindTooltip(nodeLabel, { permanent: true, direction: 'top', className: 'polygon-label' }).addTo(labelMarkers);
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

        // Filter out the ID of the polyline being removed
        node.associatedPolylineIds = node.associatedPolylineIds.filter(id => id !== polylineIdToRemove);

        // Check if this node is still used by ANY remaining polyline
        // Double check by iterating through all current polylines to see if any point matches this node's location
        let isUsed = false;
        polylines.forEach(line => {
            if (line.id === polylineIdToRemove) return; // Skip the one being removed
            const latlngs = line.layer.getLatLngs();
            latlngs.forEach(ll => {
                if (ll.equals(node.latlng, 1e-6)) {
                    isUsed = true;
                    if (!node.associatedPolylineIds.includes(line.id)) {
                        node.associatedPolylineIds.push(line.id);
                    }
                }
            });
        });

        if (!isUsed && node.associatedPolylineIds.length === 0) {
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
            const rawArea = turf.area(geojson);
            const areaSqMeters = Math.round(rawArea / 10) * 10;
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
                const rawLen = turf.length(segmentLine, { units: 'kilometers' }) * 1000;
                const segmentLength = Math.round(rawLen / 10) * 10;
                const midpointLat = (p1.lat + p2.lat) / 2;
                const midpointLng = (p1.lng + p2.lng) / 2;
                const segmentLabel = `P${currentPolylineId}-S${i + 1} = ${segmentLength.toFixed(2)} ม.`;
                const segmentMarker = L.marker([midpointLat, midpointLng], { opacity: 0 }).bindTooltip(segmentLabel, { permanent: true, direction: 'center', className: 'polygon-label' }).addTo(labelMarkers);
                lineSegments.push({ marker: segmentMarker, length_m: segmentLength });
            }
            const totalLenRaw = turf.length(layer.toGeoJSON(), { units: 'kilometers' }) * 1000;
            polylines.push({ id: currentPolylineId, layer: layer, segments: lineSegments, nodeIds: nodeIdsForThisPolyline, geojson: layer.toGeoJSON(), length_m: Math.round(totalLenRaw / 10) * 10 });
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
                const rawArea = turf.area(geojson);
                const areaSqMeters = Math.round(rawArea / 10) * 10;
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
                    const rawLen = turf.length(segmentLine, { units: 'kilometers' }) * 1000;
                    const segmentLength = Math.round(rawLen / 10) * 10;

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
                const totalLenRaw = turf.length(polylineItem.geojson, { units: 'kilometers' }) * 1000;
                polylineItem.length_m = Math.round(totalLenRaw / 10) * 10;
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
        let globalPipeCounter = 1;

        // Helper to convert number to letters (1->A, 2->B, ..., 27->AA)
        function getPipeLabel(num) {
            let s = '';
            while (num > 0) {
                let t = (num - 1) % 26;
                s = String.fromCharCode(65 + t) + s;
                num = (num - t) / 26 | 0;
            }
            return s;
        }

        polylines.forEach((line, lineIndex) => {
            line.id = lineIndex + 1;
            line.segments.forEach((seg, segIndex) => {
                const startNodeData = nodes.find(n => n.id === line.nodeIds[segIndex]);
                const endNodeData = nodes.find(n => n.id === line.nodeIds[segIndex + 1]);
                if (startNodeData && endNodeData) {
                    const startNodeLabel = `${startNodeData.id}`; // Node เป็นตัวเลขเฉยๆ
                    const endNodeLabel = `${endNodeData.id}`;   // Node เป็นตัวเลขเฉยๆ
                    const pipeSegmentId = getPipeLabel(globalPipeCounter); // Pipe เป็น A, B, C...
                    globalPipeCounter++;

                    // seg.length_m มีค่าอยู่แล้วจากการวาดหรือโหลด
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
            node.labelMarker.setTooltipContent(`${node.id}`); // Node เป็นตัวเลขเฉยๆ
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
    document.getElementById('selectMainPipeBtn').addEventListener('click', () => { bootstrap.Modal.getInstance(document.getElementById('selectTableTypeModal')).hide(); addTable('หลัก'); });
    document.getElementById('selectSubPipeBtn').addEventListener('click', () => { bootstrap.Modal.getInstance(document.getElementById('selectTableTypeModal')).hide(); addTable('ย่อย'); });

    // --- Save/Restore Map Tables State ---
    function saveMapTableState() {
        const data = [];
        document.querySelectorAll('.table-group').forEach(group => {
            const header = group.querySelector('.card-header h5').textContent;
            const type = header.includes('สายย่อย') ? 'ย่อย' : 'หลัก';
            const rowsData = [];
            const tbody = group.querySelector('tbody');
            if (tbody) {
                Array.from(tbody.rows).forEach(row => {
                    const rowVals = [];
                    row.querySelectorAll('input').forEach(input => rowVals.push(input.value));
                    rowsData.push(rowVals);
                });
            }
            data.push({ type, rows: rowsData });
        });
        localStorage.setItem('mapPageTableData', JSON.stringify(data));
    }

    function restoreMapTableState() {
        const saved = localStorage.getItem('mapPageTableData');
        if (saved) {
            const data = JSON.parse(saved);
            if (data.length > 0) {
                data.forEach(group => {
                    addTable(group.type, group.rows);
                });
                return;
            }
        }
        // Default if no data
        addTable('ย่อย');
    }

    function addTable(tableType = 'หลัก', initialRowsData = null) {
        const tableContainer = document.getElementById('tableContainer');

        // Create Card Container
        const newTableGroup = document.createElement('div');
        newTableGroup.className = 'table-group card mb-3 shadow-sm'; // Use card style
        const tableGroupCount = tableContainer.querySelectorAll('.table-group').length + 1;
        newTableGroup.id = `tableGroup${tableGroupCount}`;
        const newTableId = `tableId${tableGroupCount}`;

        // 1. Card Header
        const cardHeader = document.createElement('div');
        cardHeader.className = 'card-header fw-bold bg-light';
        const headerTitle = document.createElement('h5');
        headerTitle.className = 'mb-0';
        headerTitle.textContent = `${tableGroupCount}. ตารางคำนวณสำหรับท่อระบายน้ำสาย${tableType}`;
        cardHeader.appendChild(headerTitle);
        newTableGroup.appendChild(cardHeader);

        // 2. Card Body
        const cardBody = document.createElement('div');
        cardBody.className = 'card-body';
        newTableGroup.appendChild(cardBody);

        // Table Wrapper
        const tableResponsive = document.createElement('div');
        tableResponsive.className = 'table-responsive';
        cardBody.appendChild(tableResponsive);

        const newTable = document.createElement('table');
        newTable.className = 'table table-bordered'; // Style matching report.html
        newTable.id = newTableId;

        const thead = document.createElement('thead');
        thead.innerHTML = `
             <tr>
                <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>11</th><th>12</th><th>13</th><th>14</th><th>15</th><th>16</th><th>17</th>
            </tr>
            <tr>
                <th colspan="2">Node</th>
                <th rowspan="2" class="col-2s">หมายเลขท่อ</th>
                <th colspan="2">ความยาว</th>
                <th colspan="4">พื้นที่ที่เกิดปริมาณน้ำท่าออกแบบ</th>
                <th rowspan="2" class="col-3s">สปส.<br>เฉลี่ย<br>C</th>
                <th rowspan="2" class="col-3s">พื้นที่รวม<br>(ตร.ม.)<br>A<sub>T</sub></th>
                <th rowspan="2" class="col-2s">พื้นที่สะสม<br>(ตร.ม.)<br>A<sub>S</sub></th>
                <th colspan="3">เวลา (นาที)</th>
                <th rowspan="2" class="col-2s">i<br>(มม./ชม.)</th>
                <th rowspan="2">Q<br>(ลบ.ม./<br>วินาที)</th>
            </tr>
            <tr>
                <th class="col-1s">Start</th>
                <th class="col-1s">End</th>
                <th class="col-1s">ท่อ<br>L<br>(ม.)</th>
                <th class="col-1s">ท่อ<br>L<sub>S</sub><br>(ม.)</th>
                <th class="col-3s">พื้นที่<br>A<sub>1</sub><br>(ตร.ม.)</th>
                <th class="col-1s">สปส.<br>C<sub>1</sub></th>
                <th class="col-3s">พื้นที่<br>A<sub>2</sub><br>(ตร.ม.)</th>
                <th class="col-1s">สปส.<br>C<sub>2</sub></th>
                <th class="col-1s">t<sub>0</sub></th>
                <th class="col-1s">t<sub>pipe</sub></th>
                <th class="col-1s">T<sub>C</sub></th>
            </tr>
        `;
        newTable.appendChild(thead);
        const tbody = document.createElement('tbody');
        newTable.appendChild(tbody);
        tableResponsive.appendChild(newTable);

        // สร้างปุ่มควบคุมสำหรับตาราง
        const tableControls = document.createElement('div');
        tableControls.className = 'table-controls row justify-content-between mt-3 g-2';

        // --- กลุ่มปุ่มด้านซ้าย (เพิ่มแถว, ลบแถว) ---
        const leftButtonsDiv = document.createElement('div');
        leftButtonsDiv.className = 'col-6 col-sm-4';

        const leftButtonRow = document.createElement('div');
        leftButtonRow.className = 'row g-2';

        // ปุ่มเพิ่มแถว
        const addRowCol = document.createElement('div');
        addRowCol.className = 'col-6';
        const addRowButton = document.createElement('button');
        addRowButton.className = 'btn btn-success btn-sm w-100';
        addRowButton.textContent = 'เพิ่มแถว';
        addRowButton.onclick = () => addRow(newTableId);
        addRowCol.appendChild(addRowButton);

        // ปุ่มลบแถว
        const removeRowCol = document.createElement('div');
        removeRowCol.className = 'col-6';
        const removeRowButton = document.createElement('button');
        removeRowButton.className = 'btn btn-warning btn-sm w-100';
        removeRowButton.textContent = 'ลบแถว';
        removeRowButton.onclick = () => removeLastRow(newTableId);
        removeRowCol.appendChild(removeRowButton);

        leftButtonRow.append(addRowCol, removeRowCol);
        leftButtonsDiv.appendChild(leftButtonRow);

        // --- กลุ่มปุ่มด้านขวา (เพิ่มตาราง, ลบตาราง) ---
        const rightButtonsDiv = document.createElement('div');
        rightButtonsDiv.className = 'col-6 col-sm-4';

        const rightButtonRow = document.createElement('div');
        rightButtonRow.className = 'row g-2';

        // ปุ่มเพิ่มตาราง
        const addTableCol = document.createElement('div');
        addTableCol.className = 'col-6';
        const addTableButton = document.createElement('button');
        addTableButton.className = 'btn btn-info btn-sm w-100';
        addTableButton.textContent = 'เพิ่มตาราง';
        addTableCol.appendChild(addTableButton);
        addTableButton.onclick = () => new bootstrap.Modal(document.getElementById('selectTableTypeModal')).show();

        // ปุ่มลบตารางนี้
        const removeTableCol = document.createElement('div');
        removeTableCol.className = 'col-6';
        const removeTableButton = document.createElement('button');
        removeTableButton.className = 'btn btn-secondary btn-sm w-100';
        removeTableButton.textContent = 'ลบตารางนี้';
        removeTableCol.appendChild(removeTableButton);
        removeTableButton.onclick = () => removeTableGroup(newTableGroup.id);

        rightButtonRow.append(addTableCol, removeTableCol);
        rightButtonsDiv.appendChild(rightButtonRow);

        // --- นำกลุ่มปุ่มซ้ายและขวาใส่ใน cardBody (ต่อจากตาราง) ---
        tableControls.append(leftButtonsDiv, rightButtonsDiv);
        cardBody.appendChild(tableControls);

        // นำทุกอย่างมารวมกัน
        tableContainer.appendChild(newTableGroup);

        if (initialRowsData && initialRowsData.length > 0) {
            initialRowsData.forEach(rowData => addRow(newTableId, rowData));
        } else {
            addRow(newTableId);
        }

        saveMapTableState();
    }

    function addRow(tableId, rowValues = null) {
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
            { type: 'number', placeholder: 'C1', value: (0.60).toFixed(2), readOnly: true, isCSelector: true },
            { type: 'number', placeholder: 'A2' },
            { type: 'number', placeholder: 'C2', value: (0.90).toFixed(2), readOnly: true, isCSelector: true },
            { type: 'number', readOnly: true },
            { type: 'number', readOnly: true },
            { type: 'number', readOnly: true },
            { type: 'number', readOnly: true, value: (15).toFixed(2) },
            { type: 'number', readOnly: true },
            { type: 'number', readOnly: true },
            { type: 'number', readOnly: true },
            { type: 'number', readOnly: true }
        ];
        cellConfigs.forEach((config, index) => {
            const cell = newRow.insertCell();
            const element = document.createElement('input');
            element.type = config.type;
            element.placeholder = config.placeholder || '';

            // Priority: restored value > default config value
            if (rowValues && rowValues[index] !== undefined) {
                element.value = rowValues[index];
            } else if (config.value) {
                element.value = config.value;
            }

            if (config.readOnly) {
                element.readOnly = true;
                element.style.backgroundColor = '#e9ecef'; // สีเทาปกติ
                element.style.cursor = 'pointer';

                // Codenew: ตรวจสอบว่าเป็นปุ่มเรียก Modal หรือไม่
                if (config.isLengthSelector || config.isAreaSelector || config.isCSelector) {
                    element.style.backgroundColor = '#fae3a5ff'; // Bootstrap Orange
                    element.style.color = 'black';

                    if (config.isLengthSelector) {
                        element.addEventListener('click', (event) => openLengthSelectionModal(event.target));
                    }
                    if (config.isAreaSelector) {
                        element.addEventListener('click', (event) => openAreaSelectionModal(event.target));
                    }
                    if (config.isCSelector) {
                        element.addEventListener('click', (event) => openCSelectionModal(event.target));
                    }
                }
            } else {
                element.addEventListener('input', calculate);
            }
            element.className = 'form-control';
            cell.appendChild(element);
        });
        calculate();
        // saveMapTableState called inside calculate
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

    function updateSelectedAreaSum() {
        const checkboxes = document.querySelectorAll('.area-checkbox:checked');
        let total = 0;
        checkboxes.forEach(cb => {
            total += parseFloat(cb.value) || 0;
        });
        // Round to nearest 10
        total = Math.round(total / 10) * 10;
        const sumElement = document.getElementById('selectedAreaSum');
        if (sumElement) {
            sumElement.textContent = total.toFixed(2);
        }
    }

    function openAreaSelectionModal(inputElement) {
        activeInputForRow = inputElement;
        const listContainer = document.getElementById('area-list-container');
        listContainer.innerHTML = '';

        // Reset sum display
        const sumElement = document.getElementById('selectedAreaSum');
        if (sumElement) sumElement.textContent = '0.00';

        if (areaData.length === 0) {
            listContainer.innerHTML = '<div class="text-center p-3">ไม่พบข้อมูลพื้นที่</div>';
            return;
        }

        areaData.forEach((item, index) => {
            if (item.value == 0) return;

            const div = document.createElement('div');
            div.className = 'list-group-item';

            const checkboxId = `area-checkbox-${index}`;

            const formCheck = document.createElement('div');
            formCheck.className = 'form-check';

            const checkbox = document.createElement('input');
            checkbox.className = 'form-check-input area-checkbox';
            checkbox.type = 'checkbox';
            checkbox.value = item.value;
            checkbox.id = checkboxId;

            // Add change listener for live sum
            checkbox.addEventListener('change', updateSelectedAreaSum);

            const label = document.createElement('label');
            label.className = 'form-check-label w-100 stretched-link';
            label.htmlFor = checkboxId;
            label.textContent = item.name;
            label.style.cursor = 'pointer';

            formCheck.appendChild(checkbox);
            formCheck.appendChild(label);
            div.appendChild(formCheck);
            listContainer.appendChild(div);
        });

        new bootstrap.Modal(document.getElementById('areaSelectionModal')).show();
    }

    // Event listener for Confirm button in Area Selection Modal
    const confirmAreaBtn = document.getElementById('confirmAreaSelectionBtn');
    if (confirmAreaBtn) {
        confirmAreaBtn.addEventListener('click', () => {
            if (!activeInputForRow) return;

            const checkboxes = document.querySelectorAll('.area-checkbox:checked');
            let totalArea = 0;

            checkboxes.forEach(cb => {
                totalArea += parseFloat(cb.value) || 0;
            });

            // Round to nearest 10 as per previous requirement
            totalArea = Math.round(totalArea / 10) * 10;

            activeInputForRow.value = totalArea;

            // Restore input style
            activeInputForRow.style.backgroundColor = '#e9ecef';
            activeInputForRow.style.color = 'black';

            bootstrap.Modal.getInstance(document.getElementById('areaSelectionModal')).hide();
            calculate();
        });
    }

    // ข้อมูล C Factor ตามรูปภาพ
    const cFactorData = [
        { name: "1. ทาวน์เฮาส์ขนาดไม่มากกว่า 30 ตร.วา", value: 0.9 },
        { name: "2. ทาวน์เฮาส์หรือบ้านแฝดขนาด 30-50 ตร.วา", value: 0.8 },
        { name: "3. บ้านแฝดขนาดมากกว่า 50 ตร.วา", value: 0.7 },
        { name: "4. บ้านเดี่ยวมีบริเวณ", value: 0.6 },
        { name: "5. อาคารพาณิชย์ คอนโดมิเนียม อพาร์ทเมนต์", value: 0.8 },
        { name: "6. โฮมออฟฟิศ", value: 0.8 },
        { name: "7. คลับเฮาส์ สโมสร", value: 0.7 },
        { name: "8. ถนนผิวคอนกรีต ลานจอดรถคอนกรีต", value: 0.9 },
        { name: "9. ถนนผิวแอสฟัลต์ ผิวลาดยาง", value: 0.8 },
        { name: "10. ค่าน้อยสุดตามข้อกำหนดจัดสรรที่ดิน กทม. 2565", value: 0.6 }
    ];

    function openCSelectionModal(inputElement) {
        activeInputForRow = inputElement;
        const listContainer = document.getElementById('c-list-container');
        listContainer.innerHTML = '';

        cFactorData.forEach(item => {
            const a = document.createElement('a');
            a.href = '#';
            a.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
            a.innerHTML = `<span>${item.name}</span><span class="badge bg-primary rounded-pill">${item.value}</span>`;

            a.addEventListener('click', (e) => {
                e.preventDefault();
                activeInputForRow.value = item.value.toFixed(2);
                // Codenew: เปลี่ยนสีกลับเป็นเทา
                activeInputForRow.style.backgroundColor = '#e9ecef';
                activeInputForRow.style.color = 'black';

                bootstrap.Modal.getInstance(document.getElementById('cSelectionModal')).hide();
                calculate();
            });
            listContainer.appendChild(a);
        });
        new bootstrap.Modal(document.getElementById('cSelectionModal')).show();
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
        saveMapTableState();
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
            calculate(); // เรียกคำนวณหลังจากลบแถว (will save)
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
        calculate(); // will save
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

    // Toggle map size logic removed as requested

    // ===================================================================
    //  SECTION 4: SAVE DATA LOGIC
    // ===================================================================
    const confirmBtn = document.getElementById('btn-confirm-data');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async function (e) {


            // Ensure Map Table Data is fresh in LocalStorage
            saveMapTableState();
            // Also ensure GeoJSON is fresh
            if (typeof saveGeoJSONToLocalStorage === 'function') {
                saveGeoJSONToLocalStorage();
            }

            const allPipes = [];
            document.querySelectorAll('.table tbody tr').forEach(row => {
                const cells = row.cells;
                // Col 0: Start Node
                const startNode = cells[0].querySelector('input').value;
                // Col 1: End Node
                const endNode = cells[1].querySelector('input').value;
                // Col 2: Pipe ID (value from input)
                const pipeId = cells[2].querySelector('input').value;
                // Col 3: Length
                const length = parseFloat(cells[3].querySelector('input').value) || 0;
                // Col 16: Q (value from input)
                const qValue = parseFloat(cells[16].querySelector('input').value) || 0;

                if (pipeId && pipeId.trim() !== "") {
                    allPipes.push({
                        id: pipeId,
                        startNode: startNode,
                        endNode: endNode,
                        length: length,
                        q: qValue,
                        cell: 1, // Default to 1 cell
                        size: '-',
                        slope: '-',
                        qp: '-',
                        vp: '-',
                        v: '-',
                        status: 'Pending'
                    });
                }
            });
            localStorage.setItem('calTableData', JSON.stringify(allPipes));

            if (window.projectId) {
                const mapData = localStorage.getItem('savedMapGeoJSON') ? JSON.parse(localStorage.getItem('savedMapGeoJSON')) : null;
                const calData = localStorage.getItem('mapPageTableData') ? JSON.parse(localStorage.getItem('mapPageTableData')) : null;

                if (mapData || calData) {
                    try {
                        const response = await fetch(`/api/save_project_data/${window.projectId}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                map_data: mapData,
                                cal_data: calData
                            }),
                        });
                        if (!response.ok) {
                            console.error('Save failed with status ' + response.status);
                            // Stop redirect if save fails
                            return;
                        }
                    } catch (error) {
                        console.error('Error saving intermediate data:', error);
                        // continue regardless
                    }
                }
            }

            window.location.href = calTableUrl;
        });
    }

    loadInitialData(); // โหลดข้อมูลจาก localStorage (ถ้ามี)
    // --- Save GeoJSON for Persistence ---
    function saveGeoJSONToLocalStorage() {
        const mapData = {
            polygons: polygons.map(p => ({
                geojson: p.geojson,
                area_m2: p.area_m2
            })),
            polylines: polylines.map(p => ({
                geojson: p.geojson,
                segments: p.segments.map(s => ({ length_m: s.length_m })), // Needed? length is derived
                // We mainly need geojson. Nodes will be reconstructed.
            })),
            // We might need to save nodes? Nodes are reconstructed from polylines in logic above.
        };
        localStorage.setItem('savedMapGeoJSON', JSON.stringify(mapData));
    }

    // Update saveGeoJSONToLocalStorage whenever labels update (which happens on draw/edit/delete)
    const originalUpdateLabels = updateLabels;
    updateLabels = function () {
        originalUpdateLabels(); // Call original logic
        saveGeoJSONToLocalStorage(); // Add our saving logic
    };

    // --- Load Project Data from API ---
    window.loadProjectDataFromAPI = async function (projectId) {
        console.log(`Loading project data for ID: ${projectId}...`);
        try {
            const response = await fetch(`/api/get_project_data/${projectId}`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();

            // 1. Restore Map Data
            if (data.map_data) {
                console.log("Restoring Map Data...", data.map_data);

                // Clear existing items
                drawnItems.clearLayers();
                labelMarkers.clearLayers();
                polygons.length = 0;
                polylines.length = 0;
                nodes.length = 0; // Clear nodes too
                // markers.length = 0;
                nextPolygonId = 1;
                nextPolylineId = 1;
                nextNodeId = 1;

                // Restore Polygons
                if (data.map_data.polygons) {
                    data.map_data.polygons.forEach(pData => {
                        const layer = L.geoJSON(pData.geojson, {
                            style: { color: '#FF9900' }
                        }).getLayers()[0];
                        drawnItems.addLayer(layer); // Add to map

                        // Re-create label
                        const areaSqMeters = pData.area_m2 || turf.area(pData.geojson);
                        const centroid = turf.centroid(pData.geojson);
                        const [lng, lat] = centroid.geometry.coordinates;
                        const polygonLabel = `A${nextPolygonId} = ${areaSqMeters.toFixed(2)} ตร.ม.`;
                        const labelMarker = L.marker([lat, lng], { opacity: 0 }).bindTooltip(polygonLabel, { permanent: true, direction: 'center', className: 'polygon-label' }).addTo(labelMarkers);

                        polygons.push({ id: nextPolygonId, layer: layer, labelMarker: labelMarker, geojson: pData.geojson, area_m2: areaSqMeters });
                        nextPolygonId++;
                    });
                }

                // Restore Polylines
                if (data.map_data.polylines) {
                    data.map_data.polylines.forEach(pData => {
                        const layer = L.geoJSON(pData.geojson, {
                            style: { color: '#0000CC' }
                        }).getLayers()[0];
                        drawnItems.addLayer(layer);

                        const latlngs = layer.getLatLngs();
                        const currentPolylineId = nextPolylineId++;
                        const lineSegments = [];
                        const nodeIdsForThisPolyline = [];

                        // Re-create nodes
                        latlngs.forEach(latlng => {
                            const node = getOrCreateNode(latlng, currentPolylineId);
                            nodeIdsForThisPolyline.push(node.id);
                        });

                        // Re-create segment labels
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

                        polylines.push({ id: currentPolylineId, layer: layer, segments: lineSegments, nodeIds: nodeIdsForThisPolyline, geojson: pData.geojson, length_m: turf.length(pData.geojson, { units: 'kilometers' }) * 1000 });
                    });
                }
                updateLabels(); // Sync UI and LS
            }

            // 2. Restore Table Data (Cal Data)
            if (data.cal_data) {
                console.log("Restoring Calculation Table Data...", data.cal_data);

                // Clear existing tables
                const tableContainer = document.getElementById('tableContainer');
                tableContainer.innerHTML = '';

                data.cal_data.forEach(group => {
                    addTable(group.type, group.rows);
                });
                // Note: addTable calls calculate() which saves to LS mapPageTableData
            } else {
                // Initialize default if no data
                // restoreMapTableState() will handle LS fallback, but if we want strictly from API, maybe default empty?
                // Let's assume if no API data, we MIGHT have LS data if user just refreshed?
                // But loadProjectDataFromAPI assumes we want what's on server.
                if (!data.map_data) {
                    // If completely new/empty from server, checks LS via restoreMapTableState?
                    // Currently restoreMapTableState is called in DOMContentLoaded? 
                    // No, let's just leave it. If server has no data, existing logic (restoreMapTableState called at bottom) handles LS or default.
                }
            }

        } catch (error) {
            console.error('Error loading project data:', error);
            // Fallback to local storage if API fails?
            // restoreMapTableState();
        }
    };

    // Call restoreMapTableState ONLY if we are NOT loading from API (e.g. create mode)
    // Actually, report.html clears LS on save. So on "Edit", LS is empty. 
    // So restoreMapTableState won't find anything relevant for THIS project unless it was just edited.
    // So relying on API load is correct for Edit.

    // Check if we are in "Create New" or "Edit" mode?
    // The HTML has `if (projectId)` block that calls `loadProjectDataFromAPI`.
    // If that runs, it will overwrite.

    // Is restoreMapTableState called by default?
    // Yes, see below.

    restoreMapTableState(); // This loads from LS 'mapPageTableData'
    loadInitialData(); // Load polygonData / polylineData from LS

});