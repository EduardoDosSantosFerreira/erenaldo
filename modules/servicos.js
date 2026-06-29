// assets/js/servicos.js
import supabase from '../services/supabase.js';

// ============================================
// FUNÇÕES AUXILIARES GLOBAIS
// ============================================

// Toast
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

// Confirm
window.showConfirm = function(message, callback) {
    document.getElementById('confirmMessage').textContent = message;
    window.confirmCallback = callback;
    document.getElementById('confirmModal').style.display = 'flex';
    if (window.lucide) lucide.createIcons();
};

// Fechar confirm
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

function validateCliente(value) {
    return { isValid: value !== '' };
}

function validateNome(value) {
    return { isValid: value.trim().length > 0 };
}

function validateData(value) {
    return { isValid: value !== '' };
}

function normalizeString(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

// ============================================
// SERVIÇOS MANAGER
// ============================================

export class ServicosManager {
    constructor() {
        this.servicos = [];
        this.clientes = [];
        this.filters = {
            status: 'todos',
            cliente: '',
            tipoCliente: '',
            periodo: 'todos',
            search: ''
        };
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando ServicosManager...');
        await this.loadClientes();
        await this.loadServicos();
        this.setupEvents();
        this.setupRealtimeValidation();
        this.setupPaymentToggle();
        this.setupSearchAndFilters();
        this.checkUrlForServicoId();
    }

    // ============================================
    // VERIFICAR ID NA URL
    // ============================================

    checkUrlForServicoId() {
        const urlParams = new URLSearchParams(window.location.search);
        const servicoId = urlParams.get('id');

        if (servicoId) {
            console.log(`📋 ID do serviço encontrado na URL: ${servicoId}`);
            this.openServicoById(servicoId);
        }
    }

    async openServicoById(servicoId) {
        try {
            let tentativas = 0;
            const maxTentativas = 20;

            while (this.servicos.length === 0 && tentativas < maxTentativas) {
                await new Promise(resolve => setTimeout(resolve, 100));
                tentativas++;
            }

            let servico = this.servicos.find(s => s.id === servicoId);

            if (!servico) {
                console.log('🔍 Serviço não encontrado na lista, buscando no banco...');
                const { data, error } = await supabase
                    .from('servicos')
                    .select(`
                        *,
                        clientes:cliente_id(id, nome, tipo)
                    `)
                    .eq('id', servicoId)
                    .single();

                if (error) {
                    console.error('❌ Erro ao buscar serviço:', error);
                    window.showToast('Serviço não encontrado!', 'error');
                    return;
                }

                servico = data;

                if (servico && !this.servicos.some(s => s.id === servico.id)) {
                    this.servicos.unshift(servico);
                    this.render();
                    this.updateStats();
                }
            }

            if (servico) {
                console.log('✅ Serviço encontrado, abrindo modal...');
                setTimeout(() => {
                    this.openModal(servico);
                }, 300);
            } else {
                window.showToast('Serviço não encontrado!', 'error');
            }
        } catch (error) {
            console.error('❌ Erro ao abrir serviço por ID:', error);
            window.showToast('Erro ao carregar serviço!', 'error');
        }
    }

    // ============================================
    // CARREGAMENTO DE CLIENTES
    // ============================================

    async loadClientes() {
        try {
            console.log('📥 Carregando clientes...');
            const { data, error } = await supabase
                .from('clientes')
                .select('id, nome, tipo')
                .order('nome');

            if (error) throw error;

            this.clientes = data || [];
            console.log(`✅ ${this.clientes.length} clientes carregados`);
            this.populateClienteSelects();
        } catch (error) {
            console.error('❌ Erro ao carregar clientes:', error);
            window.showToast('Erro ao carregar clientes!', 'error');
        }
    }

    populateClienteSelects() {
        const selects = ['servicoCliente', 'filtroCliente'];
        selects.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;

            const currentValue = select.value;
            select.innerHTML = `
                <option value="">${id === 'filtroCliente' ? 'Todos' : 'Selecione um cliente...'}</option>
                ${this.clientes.map(c =>
                    `<option value="${c.id}">${c.nome}</option>`
                ).join('')}
            `;
            if (currentValue) select.value = currentValue;
        });
    }

    // ============================================
    // SETUP SEARCH AND FILTERS
    // ============================================

    setupSearchAndFilters() {
        const searchInput = document.getElementById('searchServicos');
        const clearBtn = document.getElementById('clearSearchBtn');

        // Busca em tempo real
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filters.search = e.target.value;
                clearBtn?.classList.toggle('visible', e.target.value.length > 0);
                this.loadServicos();
            });

            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.loadServicos();
                }
            });
        }

        // Limpar busca
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                this.filters.search = '';
                clearBtn.classList.remove('visible');
                this.loadServicos();
                searchInput.focus();
            });
        }

        // Filtro por tipo de cliente
        const tipoClienteFilter = document.getElementById('filtroTipoCliente');
        if (tipoClienteFilter) {
            tipoClienteFilter.addEventListener('change', (e) => {
                this.filters.tipoCliente = e.target.value;
                this.loadServicos();
            });
        }
    }

    // ============================================
    // CARREGAMENTO DE SERVIÇOS
    // ============================================

    async loadServicos() {
        try {
            console.log('📥 Carregando serviços...', this.filters);

            let query = supabase
                .from('servicos')
                .select(`
                    *,
                    clientes:cliente_id(id, nome, tipo)
                `)
                .order('data', { ascending: false });

            // Filtro por status
            if (this.filters.status && this.filters.status !== 'todos') {
                query = query.eq('status', this.filters.status);
            }

            // Filtro por cliente
            if (this.filters.cliente) {
                query = query.eq('cliente_id', this.filters.cliente);
            }

            // Filtro por período
            if (this.filters.periodo === 'hoje') {
                const hoje = new Date().toISOString().split('T')[0];
                query = query.eq('data', hoje);
            } else if (this.filters.periodo === 'semana') {
                const inicio = this.getStartOfWeek();
                const fim = this.getEndOfWeek();
                query = query.gte('data', inicio).lte('data', fim);
            } else if (this.filters.periodo === 'mes') {
                const inicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
                const fim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];
                query = query.gte('data', inicio).lte('data', fim);
            }

            const { data, error } = await query;

            if (error) throw error;

            let servicos = data || [];

            // Filtro por tipo de cliente (client-side)
            if (this.filters.tipoCliente) {
                servicos = servicos.filter(s => s.clientes?.tipo === this.filters.tipoCliente);
            }

            // Filtro por busca (client-side)
            if (this.filters.search && this.filters.search.trim() !== '') {
                const searchTerm = normalizeString(this.filters.search);
                servicos = servicos.filter(s => {
                    const servicoNome = normalizeString(s.servico);
                    const clienteNome = normalizeString(s.clientes?.nome || '');
                    return servicoNome.includes(searchTerm) || clienteNome.includes(searchTerm);
                });
            }

            this.servicos = servicos;
            console.log(`✅ ${this.servicos.length} serviços carregados`);
            this.render();
            this.updateStats();

            this.checkUrlForServicoId();

        } catch (error) {
            console.error('❌ Erro ao carregar serviços:', error);
            window.showToast('Erro ao carregar serviços!', 'error');

            const container = document.getElementById('servicosList');
            if (container) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i data-lucide="alert-circle" class="empty-icon"></i>
                        <h3>Erro ao carregar serviços</h3>
                        <p style="color: var(--gray-500);">${error.message || 'Erro desconhecido'}</p>
                        <button class="btn btn-primary" onclick="location.reload()" style="margin-top: 16px;">
                            <i data-lucide="refresh-cw"></i>
                            Tentar novamente
                        </button>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    // ============================================
    // RENDERIZAÇÃO
    // ============================================

    render() {
        const container = document.getElementById('servicosList');
        if (!container) {
            console.warn('⚠️ Container servicosList não encontrado');
            return;
        }

        if (this.servicos.length === 0) {
            const hasFilters = this.filters.search ||
                this.filters.status !== 'todos' ||
                this.filters.cliente ||
                this.filters.tipoCliente ||
                this.filters.periodo !== 'todos';

            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="briefcase" class="empty-icon"></i>
                    <h3>${hasFilters ? 'Nenhum serviço encontrado com os filtros selecionados' : 'Nenhum serviço cadastrado ainda'}</h3>
                    <p style="color: var(--gray-500);">
                        ${hasFilters ? 'Tente ajustar os filtros ou a busca' : 'Clique em "Novo Serviço" para começar'}
                    </p>
                    ${!hasFilters ? `
                        <button class="btn btn-primary" id="emptyNovoServicoBtn" style="margin-top: 16px;">
                            <i data-lucide="plus"></i>
                            Novo Serviço
                        </button>
                    ` : `
                        <button class="btn btn-outline" id="clearFiltersFromEmpty" style="margin-top: 16px;">
                            <i data-lucide="x"></i>
                            Limpar filtros
                        </button>
                    `}
                </div>
            `;

            if (window.lucide) lucide.createIcons();

            document.getElementById('emptyNovoServicoBtn')?.addEventListener('click', () => {
                this.openModal();
            });

            document.getElementById('clearFiltersFromEmpty')?.addEventListener('click', () => {
                this.clearAllFilters();
            });

            return;
        }

        const statusLabels = {
            'pendente': 'Pendente',
            'concluido': 'Concluído',
            'cancelado': 'Cancelado'
        };

        container.innerHTML = this.servicos.map(servico => {
            const isPago = servico.pago === true;
            const pagoStatus = isPago ? 'pago' : 'nao-pago';

            return `
            <div class="servico-card" data-id="${servico.id}">
                <div class="card-header">
                    <h3>${servico.servico || 'Sem título'}</h3>
                    <div class="status-group">
                        <span class="badge-status ${servico.status || 'pendente'}">
                            <i data-lucide="${servico.status === 'pendente' ? 'clock' : servico.status === 'concluido' ? 'check-circle' : 'x-circle'}"></i>
                            ${statusLabels[servico.status] || servico.status}
                        </span>
                        ${servico.status === 'concluido' ? `
                            <span class="payment-indicator ${pagoStatus}">
                                ${isPago ? '💰 Pago' : '⏳ A Pagar'}
                            </span>
                        ` : ''}
                    </div>
                </div>
                <div class="card-body">
                    <p><strong>Cliente:</strong> <span class="cliente-nome">${servico.clientes?.nome || 'Não informado'}</span></p>
                    <p><strong>Data:</strong> ${servico.data || '---'}</p>
                    ${servico.descricao ? `<p><strong>Descrição:</strong> ${servico.descricao}</p>` : ''}
                    ${servico.valor ? `<p><strong>Valor:</strong> <span class="valor">R$ ${servico.valor.toFixed(2)}</span></p>` : ''}
                </div>
                ${servico.status === 'concluido' ? `
                    <div class="card-payment-toggle">
                        <span class="toggle-info">
                            <i data-lucide="credit-card"></i>
                            Pagamento: <strong>${isPago ? '✅ Recebido' : '⏳ Pendente'}</strong>
                        </span>
                        <label class="switch">
                            <input type="checkbox" class="toggle-pagamento" data-id="${servico.id}"
                                   ${isPago ? 'checked' : ''}>
                            <span class="slider ${isPago ? 'pago' : ''}"></span>
                        </label>
                    </div>
                ` : ''}
                <div class="card-footer">
                    <button class="btn btn-primary btn-sm btn-edit" data-id="${servico.id}">
                        <i data-lucide="edit-2"></i>
                        Editar
                    </button>
                    ${servico.status !== 'concluido' ? `
                        <button class="btn btn-success btn-sm btn-complete" data-id="${servico.id}">
                            <i data-lucide="check"></i>
                            Concluir
                        </button>
                    ` : ''}
                    <button class="btn btn-danger btn-sm btn-delete" data-id="${servico.id}">
                        <i data-lucide="trash-2"></i>
                        Excluir
                    </button>
                </div>
            </div>
        `}).join('');

        if (window.lucide) lucide.createIcons();

        // Event listeners
        container.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const servico = this.servicos.find(s => s.id === id);
                if (servico) this.openModal(servico);
            });
        });

        container.querySelectorAll('.btn-complete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.completeServico(id);
            });
        });

        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                window.showConfirm('Excluir este serviço?', () => {
                    this.deleteServico(id);
                });
            });
        });

        container.querySelectorAll('.toggle-pagamento').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                const pago = e.target.checked;
                this.togglePagamento(id, pago);
            });
        });
    }

    // ============================================
    // LIMPAR FILTROS
    // ============================================

    clearAllFilters() {
        document.getElementById('filtroStatus').value = 'todos';
        document.getElementById('filtroCliente').value = '';
        document.getElementById('filtroTipoCliente').value = '';
        document.getElementById('filtroPeriodo').value = 'todos';
        document.getElementById('searchServicos').value = '';
        document.getElementById('clearSearchBtn')?.classList.remove('visible');

        this.filters.status = 'todos';
        this.filters.cliente = '';
        this.filters.tipoCliente = '';
        this.filters.periodo = 'todos';
        this.filters.search = '';

        this.loadServicos();
    }

    // ============================================
    // ESTATÍSTICAS
    // ============================================

    updateStats() {
        const total = this.servicos.length;
        const concluidos = this.servicos.filter(s => s.status === 'concluido').length;
        const pendentes = this.servicos.filter(s => s.status === 'pendente').length;
        const valorTotal = this.servicos.reduce((sum, s) => sum + (s.valor || 0), 0);

        const valorRecebido = this.servicos
            .filter(s => s.status === 'concluido' && s.pago === true)
            .reduce((sum, s) => sum + (s.valor || 0), 0) || 0;

        const valorAReceber = this.servicos
            .filter(s => s.status === 'concluido' && s.pago !== true)
            .reduce((sum, s) => sum + (s.valor || 0), 0) || 0;

        document.getElementById('totalServicos').textContent = total;
        document.getElementById('servicosConcluidos').textContent = concluidos;
        document.getElementById('servicosPendentes').textContent = pendentes;
        document.getElementById('valorTotalServicos').textContent = `R$ ${valorTotal.toFixed(2)}`;
        document.getElementById('valorRecebido').textContent = `R$ ${valorRecebido.toFixed(2)}`;
        document.getElementById('valorAReceber').textContent = `R$ ${valorAReceber.toFixed(2)}`;
    }

    // ============================================
    // TOGGLE PAGAMENTO
    // ============================================

    async togglePagamento(id, pago) {
        try {
            console.log(`💰 Alterando pagamento do serviço ${id} para ${pago ? 'PAGO' : 'NÃO PAGO'}`);

            const { error } = await supabase
                .from('servicos')
                .update({ pago: pago })
                .eq('id', id);

            if (error) throw error;

            window.showToast(pago ? '✅ Pagamento registrado como recebido!' : '⏳ Pagamento marcado como pendente', 'success');
            await this.loadServicos();
        } catch (error) {
            console.error('❌ Erro ao atualizar pagamento:', error);
            window.showToast('Erro ao atualizar pagamento: ' + error.message, 'error');
        }
    }

    setupPaymentToggle() {
        const pagoCheckbox = document.getElementById('servicoPago');
        const pagamentoStatusText = document.getElementById('pagamentoStatusText');
        const pagamentoSlider = document.getElementById('pagamentoSlider');

        if (pagoCheckbox) {
            pagoCheckbox.addEventListener('change', () => {
                if (pagoCheckbox.checked) {
                    if (pagamentoStatusText) {
                        pagamentoStatusText.textContent = '✅ Pago';
                        pagamentoStatusText.className = 'payment-status-text pago';
                    }
                    if (pagamentoSlider) {
                        pagamentoSlider.classList.add('pago');
                    }
                } else {
                    if (pagamentoStatusText) {
                        pagamentoStatusText.textContent = '⏳ Não pago';
                        pagamentoStatusText.className = 'payment-status-text nao-pago';
                    }
                    if (pagamentoSlider) {
                        pagamentoSlider.classList.remove('pago');
                    }
                }
            });
        }
    }

    // ============================================
    // VALIDAÇÃO EM TEMPO REAL
    // ============================================

    setupRealtimeValidation() {
        const nomeInput = document.getElementById('servicoNome');
        const nomeCounter = document.getElementById('nomeCounter');
        const nomeError = document.getElementById('nomeError');
        const nomeStatus = document.getElementById('nomeStatus');
        const nomeHint = document.getElementById('nomeHint');

        if (nomeInput) {
            nomeInput.addEventListener('input', () => {
                const length = nomeInput.value.length;
                if (nomeCounter) nomeCounter.textContent = `${length}/100`;

                if (length > 90 && nomeCounter) {
                    nomeCounter.className = 'char-counter limit';
                } else if (nomeCounter) {
                    nomeCounter.className = 'char-counter';
                }

                if (nomeInput.value.trim().length > 0) {
                    nomeInput.className = 'valid';
                    if (nomeStatus) {
                        nomeStatus.textContent = '✅';
                        nomeStatus.className = 'input-status valid';
                    }
                    if (nomeHint) {
                        nomeHint.className = 'input-hint success-hint';
                        nomeHint.textContent = 'Válido ✓';
                    }
                    if (nomeError) nomeError.style.display = 'none';
                } else {
                    nomeInput.className = '';
                    if (nomeStatus) {
                        nomeStatus.textContent = '';
                        nomeStatus.className = 'input-status';
                    }
                    if (nomeHint) {
                        nomeHint.className = 'input-hint';
                        nomeHint.textContent = 'Descreva o serviço de forma clara';
                    }
                    if (nomeError) nomeError.style.display = 'none';
                }
            });
        }

        const dataInput = document.getElementById('servicoData');
        const dataError = document.getElementById('dataError');
        const dataStatus = document.getElementById('dataStatus');
        const dataHint = document.getElementById('dataHint');

        if (dataInput) {
            dataInput.addEventListener('change', () => {
                if (dataInput.value) {
                    dataInput.className = 'valid';
                    if (dataStatus) {
                        dataStatus.textContent = '✅';
                        dataStatus.className = 'input-status valid';
                    }
                    if (dataHint) {
                        dataHint.className = 'input-hint success-hint';
                        dataHint.textContent = 'Data selecionada ✓';
                    }
                    if (dataError) dataError.style.display = 'none';
                } else {
                    dataInput.className = '';
                    if (dataStatus) {
                        dataStatus.textContent = '';
                        dataStatus.className = 'input-status';
                    }
                    if (dataHint) {
                        dataHint.className = 'input-hint';
                        dataHint.textContent = 'Selecione a data do serviço';
                    }
                    if (dataError) dataError.style.display = 'none';
                }
            });
        }

        const clienteSelect = document.getElementById('servicoCliente');
        const clienteError = document.getElementById('clienteError');
        const clienteStatus = document.getElementById('clienteStatus');
        const clienteHint = document.getElementById('clienteHint');

        if (clienteSelect) {
            clienteSelect.addEventListener('change', () => {
                const validation = validateCliente(clienteSelect.value);
                if (validation.isValid) {
                    clienteSelect.className = 'valid';
                    if (clienteStatus) {
                        clienteStatus.textContent = '✅';
                        clienteStatus.className = 'input-status valid';
                    }
                    if (clienteHint) {
                        clienteHint.className = 'input-hint success-hint';
                        clienteHint.textContent = 'Cliente selecionado ✓';
                    }
                    if (clienteError) clienteError.style.display = 'none';
                } else {
                    clienteSelect.className = '';
                    if (clienteStatus) {
                        clienteStatus.textContent = '';
                        clienteStatus.className = 'input-status';
                    }
                    if (clienteHint) {
                        clienteHint.className = 'input-hint';
                        clienteHint.textContent = 'Selecione o cliente para este serviço';
                    }
                    if (clienteError) clienteError.style.display = 'none';
                }
            });
        }

        const valorInput = document.getElementById('servicoValor');
        const valorHint = document.getElementById('valorHint');

        if (valorInput) {
            valorInput.addEventListener('input', () => {
                const rawValue = valorInput.value;
                const numbers = rawValue.replace(/\D/g, '');

                if (numbers === '') {
                    valorInput.value = '';
                    if (valorHint) {
                        valorHint.className = 'input-hint';
                        valorHint.textContent = 'Use vírgula para centavos (ex: 150,50)';
                    }
                    return;
                }

                const formatted = formatCurrency(numbers);
                valorInput.value = formatted;

                const parsed = parseCurrency(formatted);
                if (parsed !== null && parsed > 0) {
                    valorInput.className = 'valid';
                    if (valorHint) {
                        valorHint.className = 'input-hint success-hint';
                        valorHint.textContent = `Valor: R$ ${formatted} ✓`;
                    }
                } else {
                    valorInput.className = '';
                    if (valorHint) {
                        valorHint.className = 'input-hint';
                        valorHint.textContent = 'Use vírgula para centavos (ex: 150,50)';
                    }
                }
            });
        }

        const descricaoInput = document.getElementById('servicoDescricao');
        const descricaoCounter = document.getElementById('descricaoCounter');

        if (descricaoInput && descricaoCounter) {
            descricaoInput.addEventListener('input', () => {
                const length = descricaoInput.value.length;
                descricaoCounter.textContent = `${length}/500`;

                if (length > 450) {
                    descricaoCounter.className = 'char-counter limit';
                } else {
                    descricaoCounter.className = 'char-counter';
                }
            });
        }
    }

    // ============================================
    // CRUD
    // ============================================

    async createServico(data) {
        try {
            console.log('📝 Criando serviço:', data);
            const { error } = await supabase
                .from('servicos')
                .insert([data]);

            if (error) throw error;

            window.showToast('Serviço criado com sucesso! 🎉', 'success');
            await this.loadServicos();
            this.closeModal();
        } catch (error) {
            console.error('❌ Erro ao criar serviço:', error);
            window.showToast('Erro ao criar serviço: ' + error.message, 'error');
        }
    }

    async updateServico(id, data) {
        try {
            console.log('📝 Atualizando serviço:', id);
            const { error } = await supabase
                .from('servicos')
                .update(data)
                .eq('id', id);

            if (error) throw error;

            window.showToast('Serviço atualizado com sucesso! ✅', 'success');
            await this.loadServicos();
            this.closeModal();
        } catch (error) {
            console.error('❌ Erro ao atualizar serviço:', error);
            window.showToast('Erro ao atualizar serviço: ' + error.message, 'error');
        }
    }

    async deleteServico(id) {
        try {
            console.log('🗑️ Excluindo serviço:', id);

            const { data: notas, error: notasError } = await supabase
                .from('notas')
                .select('id')
                .eq('servico_id', id)
                .limit(1);

            if (notasError) throw notasError;

            if (notas && notas.length > 0) {
                window.showToast('Este serviço possui notas associadas. Exclua as notas primeiro.', 'warning');
                return;
            }

            const { error } = await supabase
                .from('servicos')
                .delete()
                .eq('id', id);

            if (error) throw error;

            window.showToast('Serviço excluído com sucesso! 🗑️', 'success');
            await this.loadServicos();
        } catch (error) {
            console.error('❌ Erro ao excluir serviço:', error);
            window.showToast('Erro ao excluir serviço: ' + error.message, 'error');
        }
    }

    async completeServico(id) {
        try {
            console.log('✅ Concluindo serviço:', id);

            const { data: servico, error: findError } = await supabase
                .from('servicos')
                .select('*')
                .eq('id', id)
                .single();

            if (findError) throw findError;

            if (servico.status === 'concluido') {
                window.showToast('Este serviço já está concluído!', 'warning');
                return;
            }

            const { error } = await supabase
                .from('servicos')
                .update({
                    status: 'concluido',
                    pago: false
                })
                .eq('id', id);

            if (error) throw error;

            window.showToast('Serviço concluído com sucesso! ✅', 'success');
            await this.loadServicos();
        } catch (error) {
            console.error('❌ Erro ao concluir serviço:', error);
            window.showToast('Erro ao concluir serviço: ' + error.message, 'error');
        }
    }

    // ============================================
    // MODAL
    // ============================================

    openModal(data = null) {
        const modal = document.getElementById('servicoModal');
        if (!modal) return;

        this.populateClienteSelects();

        const pagoCheckbox = document.getElementById('servicoPago');
        const pagamentoStatusText = document.getElementById('pagamentoStatusText');
        const pagamentoSlider = document.getElementById('pagamentoSlider');

        document.querySelectorAll('.form-error').forEach(e => e.style.display = 'none');
        document.querySelectorAll('#servicoForm input, #servicoForm select, #servicoForm textarea').forEach(el => {
            el.className = '';
        });
        document.querySelectorAll('.input-status').forEach(el => {
            el.textContent = '';
            el.className = 'input-status';
        });
        document.querySelectorAll('.input-hint').forEach(el => {
            el.className = 'input-hint';
        });
        document.querySelectorAll('.char-counter').forEach(el => {
            el.className = 'char-counter';
        });

        if (data) {
            document.getElementById('servicoId').value = data.id;
            document.getElementById('servicoCliente').value = data.cliente_id;
            document.getElementById('servicoNome').value = data.servico;
            document.getElementById('servicoDescricao').value = data.descricao || '';
            document.getElementById('servicoData').value = data.data;
            document.getElementById('servicoValor').value = data.valor ? `R$ ${data.valor.toFixed(2)}`.replace('.', ',') : '';
            document.getElementById('servicoStatus').value = data.status;
            document.getElementById('modalTitle').textContent = 'Editar Serviço';

            const isPago = data.pago === true;
            if (pagoCheckbox) {
                pagoCheckbox.checked = isPago;
            }
            if (isPago) {
                if (pagamentoStatusText) {
                    pagamentoStatusText.textContent = '✅ Pago';
                    pagamentoStatusText.className = 'payment-status-text pago';
                }
                if (pagamentoSlider) {
                    pagamentoSlider.classList.add('pago');
                }
            } else {
                if (pagamentoStatusText) {
                    pagamentoStatusText.textContent = '⏳ Não pago';
                    pagamentoStatusText.className = 'payment-status-text nao-pago';
                }
                if (pagamentoSlider) {
                    pagamentoSlider.classList.remove('pago');
                }
            }

            document.getElementById('nomeCounter').textContent = `${(data.servico || '').length}/100`;
            document.getElementById('descricaoCounter').textContent = `${(data.descricao || '').length}/500`;

            if (data.cliente_id) {
                document.getElementById('clienteHint').textContent = 'Cliente selecionado ✓';
                document.getElementById('clienteHint').className = 'input-hint success-hint';
                document.getElementById('clienteStatus').textContent = '✅';
                document.getElementById('clienteStatus').className = 'input-status valid';
                document.getElementById('servicoCliente').className = 'valid';
            }
            if (data.servico) {
                document.getElementById('nomeHint').textContent = 'Válido ✓';
                document.getElementById('nomeHint').className = 'input-hint success-hint';
                document.getElementById('nomeStatus').textContent = '✅';
                document.getElementById('nomeStatus').className = 'input-status valid';
                document.getElementById('servicoNome').className = 'valid';
            }
            if (data.data) {
                document.getElementById('dataHint').textContent = 'Data selecionada ✓';
                document.getElementById('dataHint').className = 'input-hint success-hint';
                document.getElementById('dataStatus').textContent = '✅';
                document.getElementById('dataStatus').className = 'input-status valid';
                document.getElementById('servicoData').className = 'valid';
            }
            if (data.valor) {
                document.getElementById('valorHint').textContent = `Valor: R$ ${data.valor.toFixed(2)} ✓`;
                document.getElementById('valorHint').className = 'input-hint success-hint';
                document.getElementById('servicoValor').className = 'valid';
            }
        } else {
            document.getElementById('servicoId').value = '';
            document.getElementById('servicoCliente').value = '';
            document.getElementById('servicoNome').value = '';
            document.getElementById('servicoDescricao').value = '';
            document.getElementById('servicoData').value = new Date().toISOString().split('T')[0];
            document.getElementById('servicoValor').value = '';
            document.getElementById('servicoStatus').value = 'pendente';
            document.getElementById('modalTitle').textContent = 'Novo Serviço';

            if (pagoCheckbox) {
                pagoCheckbox.checked = false;
            }
            if (pagamentoStatusText) {
                pagamentoStatusText.textContent = '⏳ Não pago';
                pagamentoStatusText.className = 'payment-status-text nao-pago';
            }
            if (pagamentoSlider) {
                pagamentoSlider.classList.remove('pago');
            }

            document.getElementById('nomeCounter').textContent = '0/100';
            document.getElementById('descricaoCounter').textContent = '0/500';
        }

        modal.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
        setTimeout(() => document.getElementById('servicoNome').focus(), 300);
    }

    closeModal() {
        document.getElementById('servicoModal').style.display = 'none';
    }

    // ============================================
    // SALVAR SERVIÇO
    // ============================================

    async saveServico() {
        const id = document.getElementById('servicoId').value;
        const clienteId = document.getElementById('servicoCliente').value;
        const nome = document.getElementById('servicoNome').value.trim();
        const descricao = document.getElementById('servicoDescricao').value.trim();
        const data = document.getElementById('servicoData').value;
        const valorRaw = document.getElementById('servicoValor').value;
        const valor = parseCurrency(valorRaw);
        const status = document.getElementById('servicoStatus').value;
        const pago = document.getElementById('servicoPago')?.checked || false;

        if (!clienteId) {
            window.showToast('Selecione um cliente!', 'error');
            document.getElementById('servicoCliente').focus();
            return;
        }

        if (!nome) {
            window.showToast('Informe o nome do serviço!', 'error');
            document.getElementById('servicoNome').focus();
            return;
        }

        if (!data) {
            window.showToast('Informe a data!', 'error');
            document.getElementById('servicoData').focus();
            return;
        }

        const servicoData = {
            cliente_id: clienteId,
            servico: nome,
            descricao: descricao || null,
            data: data,
            valor: valor,
            status: status,
            pago: pago
        };

        const saveBtn = document.getElementById('saveServicoBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="spinner"></span> Salvando...';
        saveBtn.disabled = true;

        try {
            if (id) {
                await this.updateServico(id, servicoData);
            } else {
                await this.createServico(servicoData);
            }
        } catch (error) {
            console.error('❌ Erro ao salvar:', error);
        } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }

    // ============================================
    // DATAS
    // ============================================

    getStartOfWeek() {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now);
        monday.setDate(diff);
        return monday.toISOString().split('T')[0];
    }

    getEndOfWeek() {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? 0 : 7 - day);
        const sunday = new Date(now);
        sunday.setDate(diff);
        return sunday.toISOString().split('T')[0];
    }

    // ============================================
    // EVENTOS
    // ============================================

    setupEvents() {
        document.getElementById('novoServicoBtn')?.addEventListener('click', () => this.openModal());
        document.getElementById('closeServicoModal')?.addEventListener('click', () => this.closeModal());
        document.getElementById('closeServicoModalBtn')?.addEventListener('click', () => this.closeModal());

        document.getElementById('saveServicoBtn')?.addEventListener('click', () => {
            console.log('🖱️ Botão Salvar clicado!');
            this.saveServico();
        });

        document.getElementById('refreshServicosBtn')?.addEventListener('click', () => this.loadServicos());

        document.getElementById('limparFiltrosBtn')?.addEventListener('click', () => {
            this.clearAllFilters();
        });

        document.getElementById('filtroStatus')?.addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.loadServicos();
        });

        document.getElementById('filtroCliente')?.addEventListener('change', (e) => {
            this.filters.cliente = e.target.value;
            this.loadServicos();
        });

        document.getElementById('filtroPeriodo')?.addEventListener('change', (e) => {
            this.filters.periodo = e.target.value;
            this.loadServicos();
        });

        document.getElementById('servicoForm')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.saveServico();
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

console.log('🚀 Inicializando Serviços...');

const initServicos = async () => {
    try {
        const { AuthService } = await import('./auth.js');

        const user = await AuthService.checkAuth();
        if (user) {
            document.getElementById('userName').textContent = user.nome || 'Usuário';
            document.getElementById('userAvatar').textContent = (user.nome || 'U').charAt(0).toUpperCase();
        }

        if (window.lucide) lucide.createIcons();

        const manager = new ServicosManager();
        window.servicosManager = manager;

        // Verificar ID na URL após inicialização
        const urlParams = new URLSearchParams(window.location.search);
        const servicoId = urlParams.get('id');
        if (servicoId) {
            setTimeout(() => {
                const servico = manager.servicos.find(s => s.id === servicoId);
                if (servico) {
                    manager.openModal(servico);
                }
            }, 500);
        }

        console.log('✅ Serviços inicializado!');
    } catch (error) {
        console.error('❌ Erro na inicialização:', error);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initServicos);
} else {
    initServicos();
}