document.addEventListener('DOMContentLoaded', () => {
    // --- Estado de la aplicación ---
    let todosLosImeis = [];
    let activeBajas = [];
    const cliente = JSON.parse(localStorage.getItem('cliente'));

    // --- Elementos del DOM ---
    const welcomeMsg = document.querySelector('#welcome-header h2');
    const bajasSelect = document.getElementById('bajas-select');
    const modelosSelect = document.getElementById('modelos-select');
    const imeiCountSpan = document.getElementById('imei-count');
    const imeiList = document.getElementById('imeis-list');
    const submitBtn = document.getElementById('submit-btn');
    const manualImeiInput = document.getElementById('manual-imei-input');
    const manualImeiBtn = document.getElementById('manual-imei-btn');

    if (!cliente) {
        window.location.href = '/login.html';
        return;
    }
    welcomeMsg.textContent = `${cliente.nombre_negocio} (${cliente.codigo_sap})`;

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
            title: '¿Estás seguro?',
            text: `¿Deseas eliminar el IMEI: ${imeiParaBorrar.imei}?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, ¡bórralo!',
            cancelButtonText: 'Cancelar'
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

    // --- Lógica Principal ---
    const procesarNuevoImei = (imei) => {
        if (!/^\d{15}$/.test(imei)) {
            return;
        }
        const bajaId = bajasSelect.value;
        const modeloId = modelosSelect.value;
        if (!bajaId || !modeloId) {
            return Swal.fire({ icon: 'warning', title: '¡Atención!', text: 'Selecciona una campaña y un modelo.' });
        }
        if (todosLosImeis.some(item => item.imei === imei)) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'warning',
                title: 'IMEI duplicado',
                showConfirmButton: false,
                timer: 2000,
                timerProgressBar: true,
            });
            return;
        }
        const baja = activeBajas.find(b => b.id == bajaId);
        const modelo = baja.modelos.find(m => m.id == modeloId);
        todosLosImeis.push({
            imei: imei,
            modelo_id: parseInt(modeloId),
            modelo_nombre: modelo.nombre_modelo,
            baja_id: parseInt(bajaId),
            baja_nombre: baja.nombre_baja
        });
        
        // --- INICIO: LÓGICA DE PAUSA/REANUDACIÓN CORREGIDA ---
        html5QrcodeScanner.pause(); // Simplemente pausamos sin argumentos.
        Swal.fire({ 
            icon: 'success', 
            title: '¡IMEI Añadido!', 
            text: imei, 
            timer: 1500, 
            showConfirmButton: false, 
            position: 'top' 
        }).then(() => {
            // Después de la alerta, esperamos un breve momento y reanudamos.
            setTimeout(() => {
                html5QrcodeScanner.resume();
            }, 500); 
        });
        // --- FIN: LÓGICA DE PAUSA/REANUDACIÓN CORREGIDA ---

        actualizarLista();
    };
    
    const onScanSuccess = (decodedText) => {
        procesarNuevoImei(decodedText);
    };
    
    const html5QrcodeScanner = new Html5QrcodeScanner("reader", { 
        fps: 10, 
        qrbox: (w, h) => ({ width: w * 0.9, height: h * 0.35 })
    });

    // --- Event Listeners (LÓGICA COMPLETA RESTAURADA) ---
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
            procesarNuevoImei(imeiValue);
            manualImeiInput.value = '';
            manualImeiInput.focus();
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
            if (!acc[curr.baja_id]) {
                acc[curr.baja_id] = [];
            }
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
                 if (!res.ok) {
                    throw new Error('Falló el envío al servidor.');
                }
            }
            const imeisEnviados = [...todosLosImeis];
            todosLosImeis = [];
            actualizarLista();
            await handleDownloadChoice(imeisEnviados);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error de Conexión', text: 'No se pudieron enviar los registros.' });
        } finally {
            submitBtn.disabled = true; // Se mantiene deshabilitado hasta que haya nuevos IMEIs
            submitBtn.textContent = 'Enviar Registros';
        }
    });

    window.addEventListener('beforeunload', (event) => {
        if (todosLosImeis.length > 0) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    // Carga inicial de datos
    (async () => {
        Swal.fire({
            title: '¡Bienvenido!',
            text: 'Para escanear los IMEIs, necesitarás permitir el acceso a tu cámara.',
            icon: 'info',
            confirmButtonText: 'Entendido'
        }).then(() => {
            html5QrcodeScanner.render(onScanSuccess, (error) => {});
        });
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

