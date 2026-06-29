// modules/notas.js
import supabase from '../services/supabase.js';

// ============================================
// TOAST GLOBAL
// ============================================
window.showToast = function(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    if (!toast || !toastMessage) {
        console.log(`[${type}] ${message}`);
        return;
    }

    const icon = toast.querySelector('i');
    toast.className = '';

    const icons = {
        success: 'check-circle',
        error: 'x-circle',
        warning: 'alert-triangle',
        info: 'info'
    };

    if (icon) {
        icon.setAttribute('data-lucide', icons[type] || 'info');
    }

    toast.classList.add(type);
    toastMessage.textContent = message;
    toast.classList.add('show');

    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
};

// ============================================
// CONFIRM GLOBAL
// ============================================
window.showConfirm = function(message, callback) {
    document.getElementById('confirmMessage').textContent = message;
    window.confirmCallback = callback;
    document.getElementById('confirmModal').style.display = 'flex';
    if (window.lucide) lucide.createIcons();
};

document.getElementById('closeConfirmModal')?.addEventListener('click', () => {
    document.getElementById('confirmModal').style.display = 'none';
});

document.getElementById('confirmCancelBtn')?.addEventListener('click', () => {
    document.getElementById('confirmModal').style.display = 'none';
});

document.getElementById('confirmActionBtn')?.addEventListener('click', () => {
    if (window.confirmCallback) {
        window.confirmCallback();
        window.confirmCallback = null;
    }
    document.getElementById('confirmModal').style.display = 'none';
});

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function formatCurrency(value) {
    let cleaned = value.replace(/\D/g, '');
    if (cleaned === '') return '';
    let number = parseInt(cleaned) / 100;
    return number.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function parseCurrency(value) {
    if (!value) return null;
    let cleaned = value.replace(/[^\d,]/g, '').replace(',', '.');
    let number = parseFloat(cleaned);
    return isNaN(number) ? null : number;
}

// ============================================
// NOTAS MANAGER
// ============================================
export class NotasManager {
    constructor() {
        this.notas = [];
        this.clientes = [];
        this.servicos = [];
        this.searchTerm = '';
        this.filtroCliente = '';
        this.selectedFile = null;
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando NotasManager...');
        await this.loadClientes();
        await this.loadServicos();
        await this.loadNotas();
        this.setupEvents();
        this.setupRealtimeValidation();
        this.setupComprovanteModal();
    }

    // ============================================
    // CARREGAMENTO DE CLIENTES
    // ============================================
    async loadClientes() {
        try {
            const { data, error } = await supabase
                .from('clientes')
                .select('id, nome')
                .order('nome');

            if (error) throw error;

            this.clientes = data || [];
            this.populateClienteSelects();
        } catch (error) {
            console.error('❌ Erro ao carregar clientes:', error);
        }
    }

    populateClienteSelects() {
        const selects = ['notaCliente', 'filtroClienteNota', 'compCliente'];
        selects.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;

            const currentValue = select.value;
            select.innerHTML = `
                <option value="">${id === 'filtroClienteNota' ? 'Todos os clientes' : 'Selecione um cliente...'}</option>
                ${this.clientes.map(c =>
                    `<option value="${c.id}">${c.nome}</option>`
                ).join('')}
            `;
            if (currentValue) select.value = currentValue;
        });
    }

    // ============================================
    // CARREGAMENTO DE SERVIÇOS
    // ============================================
    async loadServicos() {
        try {
            const { data, error } = await supabase
                .from('servicos')
                .select('id, servico, cliente_id, data, valor, status, pago')
                .order('data', { ascending: false });

            if (error) throw error;

            this.servicos = data || [];
            this.populateServicoSelect();
        } catch (error) {
            console.error('❌ Erro ao carregar serviços:', error);
        }
    }

    populateServicoSelect() {
        const select = document.getElementById('notaServico');
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = `
            <option value="">Nenhum serviço relacionado</option>
            ${this.servicos.map(s => {
                const cliente = this.clientes.find(c => c.id === s.cliente_id);
                return `<option value="${s.id}">${s.servico}${cliente ? ` - ${cliente.nome}` : ''}</option>`;
            }).join('')}
        `;
        if (currentValue) select.value = currentValue;
    }

    // ============================================
    // CARREGAMENTO DE NOTAS
    // ============================================
    async loadNotas() {
        try {
            let query = supabase
                .from('notas')
                .select(`
                    *,
                    clientes:cliente_id(nome),
                    servicos:servico_id(servico)
                `)
                .order('data_emissao', { ascending: false });

            if (this.searchTerm) {
                query = query.ilike('servico_prestado', `%${this.searchTerm}%`);
            }

            if (this.filtroCliente) {
                query = query.eq('cliente_id', this.filtroCliente);
            }

            const { data, error } = await query;
            if (error) throw error;

            this.notas = data || [];
            this.render();
            this.updateStats();

        } catch (error) {
            console.error('❌ Erro ao carregar notas:', error);
            window.showToast('Erro ao carregar notas: ' + error.message, 'error');
        }
    }

    // ============================================
    // RENDERIZAÇÃO
    // ============================================
    render() {
        const container = document.getElementById('notasList');
        if (!container) return;

        if (this.notas.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="file-text" class="empty-icon"></i>
                    <h3>Nenhuma nota fiscal</h3>
                    <p>Clique em "Nova Nota" para começar</p>
                    <button class="btn btn-primary" id="emptyNovaNotaBtn" style="margin-top: 16px;">
                        <i data-lucide="file-plus"></i>
                        Nova Nota
                    </button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            document.getElementById('emptyNovaNotaBtn')?.addEventListener('click', () => {
                this.openModal();
            });
            return;
        }

        container.innerHTML = this.notas.map(n => `
            <div class="nota-card" data-id="${n.id}">
                <div class="card-header">
                    <h3>${n.servico_prestado}</h3>
                    <span class="badge-nota ${n.arquivo_url ? 'com-arquivo' : 'sem-arquivo'}">
                        ${n.arquivo_url ? '📎 Com arquivo' : '📄 Sem arquivo'}
                    </span>
                </div>
                <div class="card-body">
                    <div class="info-item">
                        <span class="label">Cliente:</span>
                        <span class="value">${n.clientes?.nome || 'Não informado'}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Data:</span>
                        <span class="value">${n.data_emissao}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Valor:</span>
                        <span class="value highlight">R$ ${n.valor.toFixed(2)}</span>
                    </div>
                    ${n.numero_nota ? `
                        <div class="info-item">
                            <span class="label">Número:</span>
                            <span class="value">#${n.numero_nota}</span>
                        </div>
                    ` : ''}
                    ${n.servicos?.servico ? `
                        <div class="info-item">
                            <span class="label">Serviço:</span>
                            <span class="value">${n.servicos.servico}</span>
                        </div>
                    ` : ''}
                    ${n.arquivo_url ? `
                        <div class="info-item">
                            <span class="label">Arquivo:</span>
                            <a href="${n.arquivo_url}" target="_blank" class="value link">
                                📄 ${n.arquivo_nome || 'Ver arquivo'}
                            </a>
                        </div>
                    ` : ''}
                </div>
                <div class="card-footer">
                    <button class="btn btn-primary btn-sm btn-edit" data-id="${n.id}">
                        <i data-lucide="edit-2"></i> Editar
                    </button>
                    <button class="btn btn-danger btn-sm btn-delete" data-id="${n.id}">
                        <i data-lucide="trash-2"></i> Excluir
                    </button>
                </div>
            </div>
        `).join('');

        if (window.lucide) lucide.createIcons();

        container.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const nota = this.notas.find(n => n.id === id);
                if (nota) this.openModal(nota);
            });
        });

        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                window.showConfirm('Excluir esta nota?', () => {
                    this.deleteNota(id);
                });
            });
        });
    }

    updateStats() {
        const total = this.notas.length;
        const valorTotal = this.notas.reduce((sum, n) => sum + n.valor, 0);
        const comArquivo = this.notas.filter(n => n.arquivo_url).length;

        document.getElementById('totalNotas').textContent = total;
        document.getElementById('valorTotalNotas').textContent = `R$ ${valorTotal.toFixed(2)}`;
        document.getElementById('notasComArquivo').textContent = comArquivo;
    }

    // ============================================
    // VALIDAÇÃO EM TEMPO REAL
    // ============================================
    setupRealtimeValidation() {
        // Cliente
        const clienteSelect = document.getElementById('notaCliente');
        const clienteStatus = document.getElementById('clienteStatus');
        const clienteHint = document.getElementById('clienteHint');
        const clienteError = document.getElementById('clienteError');

        clienteSelect.addEventListener('change', () => {
            if (clienteSelect.value) {
                clienteSelect.className = 'valid';
                clienteStatus.textContent = '✅';
                clienteStatus.className = 'input-status valid';
                clienteHint.className = 'input-hint success-hint';
                clienteHint.textContent = 'Cliente selecionado ✓';
                clienteError.style.display = 'none';
            } else {
                clienteSelect.className = '';
                clienteStatus.textContent = '';
                clienteStatus.className = 'input-status';
                clienteHint.className = 'input-hint';
                clienteHint.textContent = 'Selecione o cliente da nota fiscal';
                clienteError.style.display = 'none';
            }
        });

        // Serviço Prestado
        const servicoInput = document.getElementById('notaServicoPrestado');
        const servicoStatus = document.getElementById('servicoStatus');
        const servicoHint = document.getElementById('servicoHint');
        const servicoError = document.getElementById('servicoError');
        const servicoCounter = document.getElementById('servicoCounter');

        servicoInput.addEventListener('input', () => {
            const value = servicoInput.value;
            const length = value.length;
            servicoCounter.textContent = `${length}/200`;

            if (length > 180) {
                servicoCounter.className = 'char-counter limit';
            } else {
                servicoCounter.className = 'char-counter';
            }

            if (value.trim().length > 0) {
                servicoInput.className = 'valid';
                servicoStatus.textContent = '✅';
                servicoStatus.className = 'input-status valid';
                servicoHint.className = 'input-hint success-hint';
                servicoHint.textContent = 'Válido ✓';
                servicoError.style.display = 'none';
            } else {
                servicoInput.className = '';
                servicoStatus.textContent = '';
                servicoStatus.className = 'input-status';
                servicoHint.className = 'input-hint';
                servicoHint.textContent = 'Descreva o serviço prestado';
                servicoError.style.display = 'none';
            }
        });

        // Data
        const dataInput = document.getElementById('notaData');
        const dataStatus = document.getElementById('dataStatus');
        const dataHint = document.getElementById('dataHint');
        const dataError = document.getElementById('dataError');

        dataInput.addEventListener('change', () => {
            if (dataInput.value) {
                dataInput.className = 'valid';
                dataStatus.textContent = '✅';
                dataStatus.className = 'input-status valid';
                dataHint.className = 'input-hint success-hint';
                dataHint.textContent = 'Data selecionada ✓';
                dataError.style.display = 'none';
            } else {
                dataInput.className = '';
                dataStatus.textContent = '';
                dataStatus.className = 'input-status';
                dataHint.className = 'input-hint';
                dataHint.textContent = 'Selecione a data de emissão';
                dataError.style.display = 'none';
            }
        });

        // Valor
        const valorInput = document.getElementById('notaValor');
        const valorHint = document.getElementById('valorHint');
        const valorError = document.getElementById('valorError');

        valorInput.addEventListener('input', () => {
            const rawValue = valorInput.value;
            const numbers = rawValue.replace(/\D/g, '');

            if (numbers === '') {
                valorInput.value = '';
                valorHint.className = 'input-hint';
                valorHint.textContent = 'Use vírgula para centavos (ex: 150,50)';
                valorError.style.display = 'none';
                return;
            }

            const formatted = formatCurrency(numbers);
            valorInput.value = formatted;

            const parsed = parseCurrency(formatted);
            if (parsed !== null && parsed > 0) {
                valorInput.className = 'valid';
                valorHint.className = 'input-hint success-hint';
                valorHint.textContent = `Valor: R$ ${formatted} ✓`;
                valorError.style.display = 'none';
            } else {
                valorInput.className = '';
                valorHint.className = 'input-hint';
                valorHint.textContent = 'Use vírgula para centavos (ex: 150,50)';
                valorError.style.display = 'none';
            }
        });
    }

    validateForm() {
        let isValid = true;

        const cliente = document.getElementById('notaCliente');
        const clienteError = document.getElementById('clienteError');
        const clienteStatus = document.getElementById('clienteStatus');
        const clienteHint = document.getElementById('clienteHint');

        if (!cliente.value) {
            cliente.className = 'invalid shake';
            clienteError.style.display = 'block';
            clienteStatus.textContent = '❌';
            clienteStatus.className = 'input-status invalid';
            clienteHint.className = 'input-hint error-hint';
            clienteHint.textContent = 'Selecione um cliente!';
            isValid = false;
        }

        const servico = document.getElementById('notaServicoPrestado');
        const servicoError = document.getElementById('servicoError');
        const servicoStatus = document.getElementById('servicoStatus');
        const servicoHint = document.getElementById('servicoHint');

        if (!servico.value.trim()) {
            servico.className = 'invalid shake';
            servicoError.style.display = 'block';
            servicoStatus.textContent = '❌';
            servicoStatus.className = 'input-status invalid';
            servicoHint.className = 'input-hint error-hint';
            servicoHint.textContent = 'Descrição do serviço é obrigatória!';
            isValid = false;
        }

        const data = document.getElementById('notaData');
        const dataError = document.getElementById('dataError');
        const dataStatus = document.getElementById('dataStatus');
        const dataHint = document.getElementById('dataHint');

        if (!data.value) {
            data.className = 'invalid shake';
            dataError.style.display = 'block';
            dataStatus.textContent = '❌';
            dataStatus.className = 'input-status invalid';
            dataHint.className = 'input-hint error-hint';
            dataHint.textContent = 'Data é obrigatória!';
            isValid = false;
        }

        const valor = document.getElementById('notaValor');
        const valorError = document.getElementById('valorError');
        const valorHint = document.getElementById('valorHint');
        const parsedValor = parseCurrency(valor.value);

        if (!valor.value || parsedValor === null || parsedValor <= 0) {
            valor.className = 'invalid shake';
            valorError.style.display = 'block';
            valorHint.className = 'input-hint error-hint';
            valorHint.textContent = 'Informe um valor válido!';
            isValid = false;
        }

        return isValid;
    }

    // ============================================
    // CRUD NOTAS
    // ============================================
    async uploadFile(file) {
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `notas/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('notas')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('notas')
                .getPublicUrl(filePath);

            return { url: publicUrl, name: file.name };
        } catch (error) {
            console.error('❌ Erro ao fazer upload:', error);
            window.showToast('Erro ao fazer upload do arquivo!', 'error');
            return null;
        }
    }

    async saveNota() {
        console.log('💾 Iniciando salvamento...');

        if (!this.validateForm()) {
            window.showToast('Preencha os campos corretamente.', 'error');
            const firstError = document.querySelector('.form-group input.invalid, .form-group select.invalid');
            if (firstError) {
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                firstError.focus();
            }
            return;
        }

        const id = document.getElementById('notaId').value;
        const clienteId = document.getElementById('notaCliente').value;
        const numero = document.getElementById('notaNumero').value.trim();
        const servicoPrestado = document.getElementById('notaServicoPrestado').value.trim();
        const servicoId = document.getElementById('notaServico').value || null;
        const data = document.getElementById('notaData').value;
        const valorRaw = document.getElementById('notaValor').value;
        const valor = parseCurrency(valorRaw);
        const file = document.getElementById('notaArquivo').files[0];

        let arquivo_url = document.getElementById('notaArquivoUrl').value || null;
        let arquivo_nome = document.getElementById('notaArquivoNome').value || null;

        const notaData = {
            cliente_id: clienteId,
            numero_nota: numero || null,
            servico_prestado: servicoPrestado,
            servico_id: servicoId,
            data_emissao: data,
            valor: valor
        };

        const saveBtn = document.getElementById('saveNotaBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="spinner"></span> Salvando...';
        saveBtn.disabled = true;

        try {
            if (file) {
                const upload = await this.uploadFile(file);
                if (upload) {
                    arquivo_url = upload.url;
                    arquivo_nome = upload.name;
                }
            }

            notaData.arquivo_url = arquivo_url;
            notaData.arquivo_nome = arquivo_nome;

            if (id) {
                console.log('📝 Atualizando nota ID:', id);
                const { error } = await supabase
                    .from('notas')
                    .update(notaData)
                    .eq('id', id);

                if (error) throw error;
                window.showToast('Nota atualizada! ✅', 'success');
            } else {
                console.log('📝 Criando nova nota...');
                const { error } = await supabase
                    .from('notas')
                    .insert([notaData]);

                if (error) throw error;
                window.showToast('Nota criada! 🎉', 'success');
            }

            await this.loadNotas();
            this.closeModal();

        } catch (error) {
            console.error('❌ Erro:', error);
            window.showToast('Erro: ' + error.message, 'error');
        } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }

    async deleteNota(id) {
        try {
            console.log('🗑️ Excluindo nota:', id);
            const { error } = await supabase
                .from('notas')
                .delete()
                .eq('id', id);

            if (error) throw error;

            window.showToast('Nota excluída! 🗑️', 'success');
            await this.loadNotas();
        } catch (error) {
            console.error('❌ Erro:', error);
            window.showToast('Erro: ' + error.message, 'error');
        }
    }

    // ============================================
    // MODAL NOTA
    // ============================================
    openModal(data = null) {
        const modal = document.getElementById('notaModal');
        if (!modal) return;

        this.populateClienteSelects();
        this.populateServicoSelect();

        document.querySelectorAll('.form-error').forEach(e => e.style.display = 'none');
        document.querySelectorAll('#notaForm input, #notaForm select').forEach(el => {
            el.className = '';
        });
        document.querySelectorAll('.input-status').forEach(el => {
            el.textContent = '';
            el.className = 'input-status';
        });
        document.querySelectorAll('.input-hint').forEach(el => {
            el.className = 'input-hint';
        });

        document.getElementById('notaArquivo').value = '';
        document.getElementById('fileName').textContent = '';
        document.getElementById('fileSize').textContent = '';
        document.getElementById('fileUpload').classList.remove('has-file');
        document.getElementById('notaArquivoUrl').value = '';
        document.getElementById('notaArquivoNome').value = '';

        if (data) {
            document.getElementById('notaId').value = data.id;
            document.getElementById('notaCliente').value = data.cliente_id;
            document.getElementById('notaNumero').value = data.numero_nota || '';
            document.getElementById('notaServicoPrestado').value = data.servico_prestado;
            document.getElementById('notaServico').value = data.servico_id || '';
            document.getElementById('notaData').value = data.data_emissao;
            document.getElementById('notaValor').value = data.valor ? `R$ ${data.valor.toFixed(2)}`.replace('.', ',') : '';
            document.getElementById('modalTitle').textContent = 'Editar Nota Fiscal';

            if (data.arquivo_url) {
                document.getElementById('notaArquivoUrl').value = data.arquivo_url;
                document.getElementById('notaArquivoNome').value = data.arquivo_nome || '';
                document.getElementById('fileName').textContent = `📄 ${data.arquivo_nome || 'Arquivo'}`;
                document.getElementById('fileUpload').classList.add('has-file');
            }

            document.getElementById('servicoCounter').textContent = `${(data.servico_prestado || '').length}/200`;

            if (data.cliente_id) {
                document.getElementById('clienteHint').textContent = 'Cliente selecionado ✓';
                document.getElementById('clienteHint').className = 'input-hint success-hint';
                document.getElementById('clienteStatus').textContent = '✅';
                document.getElementById('clienteStatus').className = 'input-status valid';
                document.getElementById('notaCliente').className = 'valid';
            }
            if (data.servico_prestado) {
                document.getElementById('servicoHint').textContent = 'Válido ✓';
                document.getElementById('servicoHint').className = 'input-hint success-hint';
                document.getElementById('servicoStatus').textContent = '✅';
                document.getElementById('servicoStatus').className = 'input-status valid';
                document.getElementById('notaServicoPrestado').className = 'valid';
            }
            if (data.data_emissao) {
                document.getElementById('dataHint').textContent = 'Data selecionada ✓';
                document.getElementById('dataHint').className = 'input-hint success-hint';
                document.getElementById('dataStatus').textContent = '✅';
                document.getElementById('dataStatus').className = 'input-status valid';
                document.getElementById('notaData').className = 'valid';
            }
            if (data.valor) {
                document.getElementById('valorHint').textContent = `Valor: R$ ${data.valor.toFixed(2)} ✓`;
                document.getElementById('valorHint').className = 'input-hint success-hint';
                document.getElementById('notaValor').className = 'valid';
            }
        } else {
            document.getElementById('notaId').value = '';
            document.getElementById('notaCliente').value = '';
            document.getElementById('notaNumero').value = '';
            document.getElementById('notaServicoPrestado').value = '';
            document.getElementById('notaServico').value = '';
            document.getElementById('notaData').value = new Date().toISOString().split('T')[0];
            document.getElementById('notaValor').value = '';
            document.getElementById('modalTitle').textContent = 'Nova Nota Fiscal';
            document.getElementById('servicoCounter').textContent = '0/200';
        }

        modal.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
        setTimeout(() => document.getElementById('notaServicoPrestado').focus(), 300);
    }

    closeModal() {
        document.getElementById('notaModal').style.display = 'none';
        document.getElementById('notaArquivo').value = '';
    }

    // ============================================
    // MODAL COMPROVANTE
    // ============================================
    setupComprovanteModal() {
        const openBtn = document.getElementById('gerarComprovanteBtn');
        const modal = document.getElementById('comprovanteModal');
        const closeBtns = ['closeComprovanteModal', 'closeComprovanteModalBtn'];
        const clienteSelect = document.getElementById('compCliente');
        const formatoRadios = document.querySelectorAll('input[name="formatoSaida"]');
        const textoArea = document.getElementById('compTextoArea');
        const gerarBtn = document.getElementById('gerarComprovanteBtn');
        const copiarBtn = document.getElementById('copiarTextoBtn');
        const editarBtn = document.getElementById('editarTextoBtn');
        const textoGerado = document.getElementById('compTextoGerado');

        // Abrir modal
        openBtn?.addEventListener('click', () => {
            this.populateClienteSelects();
            document.getElementById('compServicosList').innerHTML = `
                <div style="text-align: center; color: var(--gray-400); padding: 20px;">
                    Selecione um cliente para ver os serviços
                </div>
            `;
            document.getElementById('compTotalServicos').textContent = '0 serviços selecionados';
            document.getElementById('compTotalValor').textContent = 'R$ 0,00';
            document.getElementById('compObservacoes').value = '';
            textoArea.style.display = 'none';
            modal.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
        });

        // Fechar modal
        closeBtns.forEach(id => {
            document.getElementById(id)?.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        });

        modal?.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });

        // Carregar serviços ao selecionar cliente
        clienteSelect?.addEventListener('change', () => {
            this.loadServicosPorCliente(clienteSelect.value);
        });

        // Alternar formato
        formatoRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'texto') {
                    textoArea.style.display = 'block';
                    this.gerarTextoComprovante();
                } else {
                    textoArea.style.display = 'none';
                }
            });
        });

        // Gerar documento
        gerarBtn?.addEventListener('click', () => {
            const clienteId = clienteSelect.value;
            const formato = document.querySelector('input[name="formatoSaida"]:checked')?.value || 'pdf';

            if (!clienteId) {
                window.showToast('Selecione um cliente!', 'error');
                return;
            }

            const servicosSelecionados = document.querySelectorAll('#compServicosList input[type="checkbox"]:checked');
            if (servicosSelecionados.length === 0) {
                window.showToast('Selecione pelo menos um serviço!', 'error');
                return;
            }

            const observacoes = document.getElementById('compObservacoes').value;

            if (formato === 'pdf') {
                this.gerarPDF(clienteId, servicosSelecionados, observacoes);
            } else {
                this.gerarTextoComprovante();
            }
        });

        // Copiar texto
        copiarBtn?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(textoGerado.value);
                window.showToast('Texto copiado! 📋', 'success');
            } catch {
                // Fallback
                textoGerado.select();
                document.execCommand('copy');
                window.showToast('Texto copiado! 📋', 'success');
            }
        });

        // Editar texto
        let editando = false;
        editarBtn?.addEventListener('click', () => {
            editando = !editando;
            textoGerado.readOnly = !editando;
            editarBtn.innerHTML = editando ? '<i data-lucide="save"></i> Salvar' : '<i data-lucide="edit"></i> Editar';
            editarBtn.className = editando ? 'btn btn-success btn-sm' : 'btn btn-outline btn-sm';
            if (window.lucide) lucide.createIcons();
            if (!editando) {
                // Atualizar a seleção dos serviços baseado no texto editado (opcional)
            }
        });
    }

    async loadServicosPorCliente(clienteId) {
        const container = document.getElementById('compServicosList');
        const totalServicosSpan = document.getElementById('compTotalServicos');
        const totalValorSpan = document.getElementById('compTotalValor');

        if (!clienteId) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--gray-400); padding: 20px;">
                    Selecione um cliente para ver os serviços
                </div>
            `;
            totalServicosSpan.textContent = '0 serviços selecionados';
            totalValorSpan.textContent = 'R$ 0,00';
            return;
        }

        try {
            const { data, error } = await supabase
                .from('servicos')
                .select('id, servico, data, valor, status, pago')
                .eq('cliente_id', clienteId)
                .order('data', { ascending: false });

            if (error) throw error;

            const servicos = data || [];

            if (servicos.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; color: var(--gray-400); padding: 20px;">
                        Nenhum serviço encontrado para este cliente
                    </div>
                `;
                totalServicosSpan.textContent = '0 serviços selecionados';
                totalValorSpan.textContent = 'R$ 0,00';
                return;
            }

            container.innerHTML = servicos.map(s => `
                <div class="servico-item-check">
                    <input type="checkbox" id="servico_${s.id}" value="${s.id}" data-nome="${s.servico}" data-valor="${s.valor || 0}">
                    <label for="servico_${s.id}" style="flex: 1; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                        <span class="servico-info">
                            <span class="servico-nome">${s.servico}</span>
                            <span class="servico-data">📅 ${s.data} ${s.status === 'concluido' ? '✅' : '⏳'}</span>
                        </span>
                        <span class="servico-valor">${s.valor ? `R$ ${s.valor.toFixed(2)}` : 'R$ 0,00'}</span>
                    </label>
                </div>
            `).join('');

            // Atualizar total ao selecionar
            container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', () => this.atualizarTotalComprovante());
            });

            this.atualizarTotalComprovante();

        } catch (error) {
            console.error('❌ Erro ao carregar serviços:', error);
            container.innerHTML = `
                <div style="text-align: center; color: var(--gray-400); padding: 20px;">
                    Erro ao carregar serviços
                </div>
            `;
        }
    }

    atualizarTotalComprovante() {
        const checkboxes = document.querySelectorAll('#compServicosList input[type="checkbox"]:checked');
        const total = checkboxes.length;
        let valorTotal = 0;

        checkboxes.forEach(cb => {
            valorTotal += parseFloat(cb.dataset.valor || 0);
        });

        document.getElementById('compTotalServicos').textContent = `${total} serviço${total !== 1 ? 's' : ''} selecionado${total !== 1 ? 's' : ''}`;
        document.getElementById('compTotalValor').textContent = `R$ ${valorTotal.toFixed(2)}`;

        // Atualizar texto se estiver no modo texto
        const formato = document.querySelector('input[name="formatoSaida"]:checked')?.value;
        if (formato === 'texto') {
            this.gerarTextoComprovante();
        }
    }

    gerarTextoComprovante() {
        const clienteSelect = document.getElementById('compCliente');
        const clienteNome = clienteSelect.options[clienteSelect.selectedIndex]?.text || 'Cliente não selecionado';
        const checkboxes = document.querySelectorAll('#compServicosList input[type="checkbox"]:checked');
        const observacoes = document.getElementById('compObservacoes').value;
        const textoArea = document.getElementById('compTextoGerado');

        if (checkboxes.length === 0) {
            textoArea.value = 'Selecione pelo menos um serviço para gerar o comprovante.';
            return;
        }

        const now = new Date();
        const dataStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

        let texto = '📋 SERVIÇOS REALIZADOS\n';
        texto += '═'.repeat(40) + '\n\n';
        texto += `Cliente: ${clienteNome}\n`;
        texto += `Data: ${dataStr}\n\n`;
        texto += '─'.repeat(40) + '\n\n';

        let total = 0;
        checkboxes.forEach((cb, index) => {
            const nome = cb.dataset.nome || 'Serviço';
            const valor = parseFloat(cb.dataset.valor || 0);
            total += valor;
            texto += `${index + 1}. ${nome}`;
            if (valor > 0) {
                texto += ` — R$ ${valor.toFixed(2)}`;
            }
            texto += '\n';
        });

        texto += '\n' + '─'.repeat(40) + '\n\n';
        texto += `💰 TOTAL: R$ ${total.toFixed(2)}\n\n`;

        if (observacoes) {
            texto += '📝 Observações:\n';
            texto += observacoes + '\n\n';
        }

        texto += '═'.repeat(40) + '\n';
        texto += 'Obrigado pela preferência! 🙏\n';
        texto += `Documento gerado em ${now.toLocaleString('pt-BR')}`;

        textoArea.value = texto;
        textoArea.readOnly = true;
    }

    async gerarPDF(clienteId, servicosSelecionados, observacoes) {
        try {
            window.showToast('Gerando PDF...', 'info');

            // Buscar dados do cliente
            const { data: cliente, error: clienteError } = await supabase
                .from('clientes')
                .select('*')
                .eq('id', clienteId)
                .single();

            if (clienteError) throw clienteError;

            const now = new Date();
            const dataStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
            const horaStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            let total = 0;
            let servicosHtml = '';
            servicosSelecionados.forEach((cb, index) => {
                const nome = cb.dataset.nome || 'Serviço';
                const valor = parseFloat(cb.dataset.valor || 0);
                total += valor;
                servicosHtml += `
                    <tr>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${index + 1}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${nome}</td>
                        <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: right;">R$ ${valor.toFixed(2)}</td>
                    </tr>
                `;
            });

            // Criar HTML para o PDF
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Comprovante de Serviços</title>
                    <style>
                        body {
                            font-family: 'Helvetica', Arial, sans-serif;
                            margin: 40px;
                            color: #333;
                            line-height: 1.6;
                        }
                        .header {
                            text-align: center;
                            border-bottom: 3px solid #B71C1C;
                            padding-bottom: 20px;
                            margin-bottom: 30px;
                        }
                        .header h1 {
                            color: #B71C1C;
                            font-size: 28px;
                            margin: 0;
                            letter-spacing: 2px;
                        }
                        .header p {
                            color: #666;
                            font-size: 14px;
                            margin: 5px 0 0;
                        }
                        .info {
                            display: flex;
                            justify-content: space-between;
                            margin-bottom: 25px;
                            padding: 15px 20px;
                            background: #f8f8f8;
                            border-radius: 8px;
                        }
                        .info-item {
                            font-size: 14px;
                        }
                        .info-item strong {
                            color: #555;
                        }
                        .info-item .valor {
                            color: #B71C1C;
                            font-weight: 700;
                            font-size: 16px;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin: 20px 0;
                        }
                        thead th {
                            background: #B71C1C;
                            color: white;
                            padding: 10px 12px;
                            text-align: left;
                            font-size: 13px;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                        }
                        tbody tr:nth-child(even) {
                            background: #f9f9f9;
                        }
                        tbody td {
                            padding: 8px 12px;
                            border-bottom: 1px solid #eee;
                            font-size: 14px;
                        }
                        .total-row {
                            background: #f0f0f0 !important;
                            font-weight: 700;
                        }
                        .total-row td {
                            border-bottom: none;
                            padding: 12px;
                        }
                        .total-row .total-label {
                            text-align: right;
                            font-size: 16px;
                        }
                        .total-row .total-value {
                            text-align: right;
                            font-size: 18px;
                            color: #B71C1C;
                        }
                        .observacoes {
                            margin-top: 30px;
                            padding: 15px 20px;
                            background: #f8f8f8;
                            border-radius: 8px;
                            border-left: 4px solid #B71C1C;
                        }
                        .observacoes h4 {
                            margin: 0 0 8px;
                            color: #555;
                            font-size: 14px;
                        }
                        .observacoes p {
                            margin: 0;
                            font-size: 14px;
                            color: #666;
                        }
                        .footer {
                            text-align: center;
                            margin-top: 40px;
                            padding-top: 20px;
                            border-top: 1px solid #ddd;
                            font-size: 12px;
                            color: #999;
                        }
                        .footer .thanks {
                            font-size: 16px;
                            color: #B71C1C;
                            font-weight: 600;
                        }
                        @media print {
                            body { margin: 20px; }
                            .no-print { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>ERENALDO</h1>
                        <p>Serviços Técnicos Especializados</p>
                    </div>

                    <div class="info">
                        <div class="info-item">
                            <strong>Cliente:</strong> ${cliente.nome}
                        </div>
                        <div class="info-item">
                            <strong>Data:</strong> ${dataStr} às ${horaStr}
                        </div>
                        <div class="info-item">
                            <strong>Total:</strong> <span class="valor">R$ ${total.toFixed(2)}</span>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width: 50px;">#</th>
                                <th>Serviço</th>
                                <th style="text-align: right; width: 120px;">Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${servicosHtml}
                            <tr class="total-row">
                                <td colspan="2" class="total-label">TOTAL</td>
                                <td class="total-value">R$ ${total.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>

                    ${observacoes ? `
                        <div class="observacoes">
                            <h4>📝 Observações</h4>
                            <p>${observacoes}</p>
                        </div>
                    ` : ''}

                    <div class="footer">
                        <div class="thanks">Obrigado pela preferência!</div>
                        <p>Documento gerado em ${now.toLocaleString('pt-BR')}</p>
                    </div>
                </body>
                </html>
            `;

            // Gerar PDF usando html2pdf
            const element = document.createElement('div');
            element.innerHTML = html;
            element.style.position = 'fixed';
            element.style.left = '-9999px';
            element.style.top = '0';
            document.body.appendChild(element);

            const opt = {
                margin: [10, 10, 10, 10],
                filename: `comprovante_${cliente.nome.replace(/\s/g, '_')}_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    letterRendering: true
                },
                jsPDF: {
                    unit: 'mm',
                    format: 'a4',
                    orientation: 'portrait'
                }
            };

            await html2pdf().set(opt).from(element).save();

            document.body.removeChild(element);
            window.showToast('PDF gerado com sucesso! 📄', 'success');

        } catch (error) {
            console.error('❌ Erro ao gerar PDF:', error);
            window.showToast('Erro ao gerar PDF: ' + error.message, 'error');
        }
    }

    // ============================================
    // EVENTOS
    // ============================================
    setupEvents() {
        document.getElementById('novaNotaBtn')?.addEventListener('click', () => this.openModal());
        document.getElementById('closeNotaModal')?.addEventListener('click', () => this.closeModal());
        document.getElementById('closeNotaModalBtn')?.addEventListener('click', () => this.closeModal());
        document.getElementById('saveNotaBtn')?.addEventListener('click', () => this.saveNota());

        document.getElementById('refreshNotasBtn')?.addEventListener('click', () => this.loadNotas());

        document.getElementById('limparFiltrosBtn')?.addEventListener('click', () => {
            document.getElementById('searchNotas').value = '';
            document.getElementById('filtroClienteNota').value = '';
            this.searchTerm = '';
            this.filtroCliente = '';
            this.loadNotas();
        });

        document.getElementById('searchNotas')?.addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.loadNotas();
        });

        document.getElementById('filtroClienteNota')?.addEventListener('change', (e) => {
            this.filtroCliente = e.target.value;
            this.loadNotas();
        });

        // File upload
        document.getElementById('fileUpload')?.addEventListener('click', (e) => {
            if (!e.target.closest('.remove-file')) {
                document.getElementById('notaArquivo').click();
            }
        });

        document.getElementById('notaArquivo')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    window.showToast('Arquivo muito grande! Máximo 5MB.', 'error');
                    e.target.value = '';
                    return;
                }
                document.getElementById('fileName').textContent = `📄 ${file.name}`;
                document.getElementById('fileSize').textContent = `${(file.size / 1024).toFixed(1)} KB`;
                document.getElementById('fileUpload').classList.add('has-file');
            }
        });

        document.getElementById('removeFileBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('notaArquivo').value = '';
            document.getElementById('fileName').textContent = '';
            document.getElementById('fileSize').textContent = '';
            document.getElementById('fileUpload').classList.remove('has-file');
            document.getElementById('notaArquivoUrl').value = '';
            document.getElementById('notaArquivoNome').value = '';
        });

        document.getElementById('notaForm')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.saveNota();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
            }
        });

        console.log('✅ Event listeners configurados');
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
console.log('🚀 Inicializando Notas...');

const initNotas = async () => {
    try {
        const { AuthService } = await import('./auth.js');

        const user = await AuthService.checkAuth();
        if (user) {
            document.getElementById('userName').textContent = user.nome || 'Usuário';
            document.getElementById('userAvatar').textContent = (user.nome || 'U').charAt(0).toUpperCase();
        }

        if (window.lucide) lucide.createIcons();

        const manager = new NotasManager();
        window.notasManager = manager;

        console.log('✅ Notas inicializado!');
    } catch (error) {
        console.error('❌ Erro na inicialização:', error);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotas);
} else {
    initNotas();
}