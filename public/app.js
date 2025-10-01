document.addEventListener('DOMContentLoaded', () => {
    // --- Estado de la aplicación ---
    let todosLosImeis = [];
    let activeBajas = [];
    const cliente = JSON.parse(localStorage.getItem('cliente'));
    let html5QrCode;
    let cameras = [];
    let currentCameraId;
    let lastScanTime = 0; // Variable para controlar el tiempo entre escaneos

    // --- Elementos del DOM ---
    const welcomeMsg = document.querySelector('#welcome-header h2');
    const bajasSelect = document.getElementById('bajas-select');
    const modelosSelect = document.getElementById('modelos-select');
    const imeiCountSpan = document.getElementById('imei-count');
    const imeiList = document.getElementById('imeis-list');
    const submitBtn = document.getElementById('submit-btn');
    const manualImeiInput = document.getElementById('manual-imei-input');
    const manualImeiBtn = document.getElementById('manual-imei-btn');
    const switchCameraBtn = document.getElementById('switch-camera-btn');
    const readerElement = document.getElementById('reader');
    const changeClientBtn = document.getElementById('change-client-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if (!cliente) {
        window.location.href = '/login.html';
        return;
    }
    welcomeMsg.textContent = `${cliente.nombre_negocio} (${cliente.codigo_sap})`;

    changeClientBtn.addEventListener('click', () => {
    localStorage.removeItem('cliente'); // Limpia la sesión actual
    window.location.href = '/login.html'; //lleva a la página de login
});
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('cliente');
        window.location.href = '/login.html';
    });

    // --- Lógica de Cámara Robusta ---
    const stopCurrentScanner = async () => {
        if (html5QrCode && html5QrCode.isScanning) {
            try {
                await html5QrCode.stop();
            } catch (err) {
                console.error("Error menor al detener el escáner, se puede ignorar:", err);
            }
        }
        try {
            readerElement.innerHTML = '';
        } catch (e) {}
    };

   // lorozco440/control-imei/Control-IMEI-d7d3f0b4a4ec21a312b288eb89eae09a589d9c43/public/app.js (Modificación en startScanner)

    const startScanner = async (cameraId) => {
        await stopCurrentScanner();
        
        // --- CORRECCIÓN CRÍTICA: ELIMINAR RESTRICCIONES DE RESOLUCIÓN ---
        const config = {
            fps: 10,
            qrbox: (w, h) => ({ width: w * 0.9, height: h * 0.25 }), // Mantenemos la caja de escaneo pequeña
            videoConstraints: {
                // CLAVE: Usamos la restricción estricta de ambiente para forzar la cámara trasera,
                // pero ya no pedimos resoluciones fijas para evitar el OverconstrainedError.
                facingMode: { exact: "environment" },
                
                // ¡IMPORTANTE! Se eliminan las líneas de width/height ideal para resolver el fallo
                // El navegador usará la mejor resolución disponible por defecto.
            }
        };

        html5QrCode = new Html5Qrcode("reader");
        try {
            await html5QrCode.start(cameraId, config, onScanSuccess, (errorMessage) => {});
        } catch (err) {
            console.error("Error al iniciar la cámara:", err);
            // Mensaje de error simplificado
            Swal.fire('Error de Cámara', 'No se pudo iniciar la cámara. Por favor, utiliza la entrada manual.', 'error');
        }
    };
        html5QrCode = new Html5Qrcode("reader");
        try {
            // El cameraId (ID del dispositivo) se pasa aquí para seleccionar la cámara.
            await html5QrCode.start(cameraId, config, onScanSuccess, (errorMessage) => {});
        } catch (err) {
            console.error("Error al iniciar la cámara:", err);
            
            if (String(err).includes('OverconstrainedError')) {
                // Si aún falla por Overconstrained, es probable que la resolución sea el problema.
                 Swal.fire('Atención', 'El dispositivo no soporta la resolución de cámara solicitada. Intenta reiniciar la aplicación o utiliza la entrada manual.', 'error');
            } else {
                 Swal.fire('Error de Cámara', 'No se pudo iniciar la cámara. Asegúrate de haber dado los permisos.', 'error');
            }
        }
    };
    const initializeCamera = async () => {
        try {
            cameras = await Html5Qrcode.getCameras();
            if (cameras && cameras.length) {
                const rearCamera = cameras.find(camera => camera.label.toLowerCase().includes('back') || camera.label.toLowerCase().includes('rear') || camera.label.toLowerCase().includes('trasera'));
                if (cameras.length > 1) {
                    switchCameraBtn.style.display = 'flex';
                }
                currentCameraId = rearCamera ? rearCamera.id : cameras[0].id;
                startScanner(currentCameraId);
            } else {
                Swal.fire('Sin Cámaras', 'No se encontraron cámaras en este dispositivo.', 'error');
            }
        } catch (err) {
            console.error("Fallo al obtener cámaras:", err);
            Swal.fire('Error de Permisos', 'No se pudo acceder a las cámaras. Por favor, concede los permisos necesarios.', 'error');
        }
    };
    
    switchCameraBtn.addEventListener('click', () => {
        if (cameras.length > 1) {
            const currentIndex = cameras.findIndex(c => c.id === currentCameraId);
            const nextIndex = (currentIndex + 1) % cameras.length;
            currentCameraId = cameras[nextIndex].id;
            startScanner(currentCameraId);
        }
    });

    // --- Funciones de Renderizado y UI ---
    const actualizarLista = () => {
        imeiList.innerHTML = '';
        if (todosLosImeis.length === 0) {
            imeiList.innerHTML = '<li>Aún no has registrado ningún IMEI.</li>';
        } else {
            [...todosLosImeis].reverse().forEach((item, index) => {
                const originalIndex = todosLosImeis.length - 1 - index;
                const li = document.createElement('li');
                li.innerHTML = `
                    <div class="imei-info">
                        <span class="model-name">${item.modelo_nombre}</span>
                        <span class="imei-number">${item.imei}</span>
                    </div>
                    <button class="delete-imei-btn" data-index="${originalIndex}">&times;</button>
                `;
                imeiList.appendChild(li);
            });
        }
        imeiCountSpan.textContent = todosLosImeis.length;
        submitBtn.disabled = todosLosImeis.length === 0;
    };

    const eliminarImei = async (index) => {
        const imeiParaBorrar = todosLosImeis[index];
        const result = await Swal.fire({
            title: '¿Estás seguro?', text: `¿Deseas eliminar el IMEI: ${imeiParaBorrar.imei}?`, icon: 'warning',
            showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, ¡bórralo!', cancelButtonText: 'Cancelar'
        });
        if (result.isConfirmed) {
            todosLosImeis.splice(index, 1);
            actualizarLista();
            Swal.fire('¡Eliminado!', 'El IMEI ha sido eliminado de la lista.', 'success');
        }
    };
    
    imeiList.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-imei-btn')) {
            const index = parseInt(event.target.dataset.index, 10);
            eliminarImei(index);
        }
    });

    // --- Funciones de Exportación ---
    const generarPDF = (registros) => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.width;
        const margin = 15;
        doc.setFillColor(41, 128, 185);
        doc.rect(0, 0, pageWidth, 35, 'F');
        doc.setFontSize(22).setTextColor(255).setFont(undefined, 'bold');
        doc.text("Reporte de IMEIs", margin, 22);
        doc.setFontSize(11).setTextColor(80).setFont(undefined, 'normal');
        doc.text(`Cliente: ${cliente.nombre_negocio} (${cliente.codigo_sap})`, margin, 45);
        doc.text(`Fecha de Reporte: ${new Date().toLocaleString()}`, margin, 51);
        let yPos = 65;
        const agrupados = registros.reduce((acc, curr) => {
            const key = `Campaña: ${curr.baja_nombre} / Modelo: ${curr.modelo_nombre}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(curr.imei);
            return acc;
        }, {});
        for (const grupo in agrupados) {
            if (yPos > 260) { doc.addPage(); yPos = 20; }
            doc.setFontSize(14).setTextColor(41, 128, 185).setFont(undefined, 'bold');
            doc.text(grupo, margin, yPos);
            yPos += 8;
            doc.setFontSize(10).setTextColor(50).setFont(undefined, 'normal');
            let counter = 1;
            agrupados[grupo].forEach(imei => {
                if (yPos > 270) { doc.addPage(); yPos = 20; }
                doc.text(`${counter++}. ${imei}`, margin + 2, yPos);
                yPos += 6;
            });
            yPos += 5;
        }
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(9).setTextColor(150);
            doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, 287, { align: 'center' });
        }
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        doc.save(`Reporte_IMEIs_${cliente.codigo_sap}_${timestamp}.pdf`);
    };

    const generarExcel = async (registros) => {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Control IMEI';
        const worksheet = workbook.addWorksheet('IMEIs Registrados');
        worksheet.columns = [
            { header: 'Campaña', key: 'baja_nombre', width: 30 },
            { header: 'Modelo', key: 'modelo_nombre', width: 30 },
            { header: 'IMEI', key: 'imei', width: 25 },
        ];
        worksheet.getRow(1).font = { bold: true };
        worksheet.addRows(registros);
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Reporte_IMEIs_${cliente.codigo_sap}_${timestamp}.xlsx`;
        link.click();
    };
    
    // --- Lógica Principal de Procesamiento ---
    const procesarNuevoImei = (imei, isManual = false) => {
        // --- INICIO: Corrección de validación manual ---
        if (!/^\d{15}$/.test(imei)) {
            if (isManual) {
                Swal.fire({
                    icon: 'error',
                    title: 'IMEI Inválido',
                    text: 'El IMEI debe contener exactamente 15 dígitos numéricos.',
                });
            }
            return false; // Retorna false si no es válido
        }
        // --- FIN: Corrección de validación manual ---
        
        const bajaId = bajasSelect.value;
        const modeloId = modelosSelect.value;
        
        if (!bajaId || !modeloId) {
            Swal.fire({ icon: 'warning', title: '¡Atención!', text: 'Selecciona una campaña y un modelo.' });
            return false;
        }
        
        if (todosLosImeis.some(item => item.imei === imei)) {
            Swal.fire({
                toast: true, position: 'top-end', icon: 'warning',
                title: 'IMEI duplicado', showConfirmButton: false, timer: 2000, timerProgressBar: true,
            });
            return false;
        }

        const baja = activeBajas.find(b => b.id == bajaId);
        const modelo = baja.modelos.find(m => m.id == modeloId);
        
        todosLosImeis.push({
            imei: imei, modelo_id: parseInt(modeloId), modelo_nombre: modelo.nombre_modelo,
            baja_id: parseInt(bajaId), baja_nombre: baja.nombre_baja
        });

        Swal.fire({ 
            icon: 'success', title: '¡IMEI Añadido!', text: imei, 
            timer: 1500, showConfirmButton: false, position: 'top' 
        });

        actualizarLista();
        return true; // Retorna true si fue exitoso
    };
    
    const onScanSuccess = (decodedText, decodedResult) => {
        const now = Date.now();
        if (now - lastScanTime < 2000) {
            return;
        }
        lastScanTime = now;
        procesarNuevoImei(decodedText, false); // isManual es false para escaneos
    };

    bajasSelect.addEventListener('change', () => {
        const selectedBajaId = bajasSelect.value;
        modelosSelect.innerHTML = '<option value="">Selecciona un modelo</option>';
        modelosSelect.disabled = true;
        if (selectedBajaId) {
            const baja = activeBajas.find(b => b.id == selectedBajaId);
            if (baja && baja.modelos && baja.modelos.length > 0) {
                modelosSelect.innerHTML += baja.modelos.map(m => `<option value="${m.id}">${m.nombre_modelo}</option>`).join('');
                modelosSelect.disabled = false;
            } else {
                 modelosSelect.innerHTML = '<option value="">No hay modelos en esta campaña</option>';
            }
        }
    });

    manualImeiBtn.addEventListener('click', () => {
        const imeiValue = manualImeiInput.value.trim();
        if (imeiValue) {
            // --- INICIO: Corrección del listener del botón manual ---
            const success = procesarNuevoImei(imeiValue, true); // isManual es true
            if (success) {
                manualImeiInput.value = '';
                manualImeiInput.focus();
            }
            // --- FIN: Corrección del listener del botón manual ---
        }
    });

    manualImeiInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            manualImeiBtn.click();
        }
    });

    const handleDownloadChoice = async (imeisEnviados) => {
        const { isConfirmed: quierePDF } = await Swal.fire({
            title: '¡Registros Enviados!', text: '¿Deseas descargar un comprobante en PDF?', icon: 'success',
            showCancelButton: true, confirmButtonText: 'Sí, descargar PDF', cancelButtonText: 'No, gracias'
        });
        if (quierePDF) {
            generarPDF(imeisEnviados);
            const { isConfirmed: quiereExcel } = await Swal.fire({
                title: 'PDF Descargado', text: '¿También deseas descargar el reporte en Excel?', icon: 'info',
                showCancelButton: true, confirmButtonText: 'Sí, descargar Excel', cancelButtonText: 'Finalizar'
            });
            if (quiereExcel) generarExcel(imeisEnviados);
        } else {
            const { isConfirmed: estaSeguro } = await Swal.fire({
                title: '¿Estás seguro?', text: 'El comprobante te sirve como respaldo. ¿Seguro que no quieres descargarlo?', icon: 'warning',
                showCancelButton: true, confirmButtonText: 'Sí, estoy seguro', cancelButtonText: 'Volver a descargas'
            });
            if (!estaSeguro) handleDownloadChoice(imeisEnviados);
        }
    };

    submitBtn.addEventListener('click', async () => {
        if (todosLosImeis.length === 0) return;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';

        const registrosAgrupados = todosLosImeis.reduce((acc, curr) => {
            if (!acc[curr.baja_id]) acc[curr.baja_id] = [];
            acc[curr.baja_id].push({ modelo_id: curr.modelo_id, imei: curr.imei });
            return acc;
        }, {});

        try {
            for (const baja_id in registrosAgrupados) {
                const res = await fetch('/api/imeis/registrar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cliente_sap: cliente.codigo_sap,
                        registros: registrosAgrupados[baja_id],
                        baja_id: parseInt(baja_id)
                    })
                });
                 if (!res.ok) throw new Error('Falló el envío al servidor.');
            }
            const imeisEnviados = [...todosLosImeis];
            todosLosImeis = [];
            actualizarLista();
            await handleDownloadChoice(imeisEnviados);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error de Conexión', text: 'No se pudieron enviar los registros.' });
        } finally {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviar Registros';
        }
    });

    // --- INICIO: Corrección del listener beforeunload ---
    // Este código es el estándar y correcto. El navegador mostrará un diálogo genérico por seguridad.
    window.addEventListener('beforeunload', (event) => {
        if (todosLosImeis.length > 0) {
            event.preventDefault();
            // Requerido por algunos navegadores.
            event.returnValue = '';
            return '';
        }
    });
    // --- FIN: Corrección del listener beforeunload ---
    
    // --- Carga Inicial de Datos ---
    (async () => {
        await Swal.fire({
            title: '¡Bienvenido!',
            text: 'Para escanear los IMEIs, necesitarás permitir el acceso a tu cámara.',
            icon: 'info',
            confirmButtonText: 'Entendido'
        });
        
        await initializeCamera();

        try {
            const res = await fetch('/api/bajas/activas');
            const data = await res.json();
            if (data.ok && data.bajas.length > 0) {
                activeBajas = data.bajas;
                bajasSelect.innerHTML = '<option value="">Selecciona una campaña</option>' + activeBajas.map(b => `<option value="${b.id}">${b.nombre_baja}</option>`).join('');
            } else {
                bajasSelect.innerHTML = '<option value="">No hay campañas activas</option>';
                modelosSelect.disabled = true;
            }
        } catch (err) {
            bajasSelect.innerHTML = '<option value="">Error al cargar campañas</option>';
            modelosSelect.disabled = true;
        }
        actualizarLista();
    })();
});

