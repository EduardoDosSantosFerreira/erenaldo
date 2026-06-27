// modules/servicos.js
import supabase from '../services/supabase.js';

export class ServicosManager {
    constructor() {
        this.servicos = [];
        this.clientes = [];
        this.filters = {
            status: 'todos',
            cliente: '',
            periodo: 'todos'
        };
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando ServicosManager...');
        await this.loadClientes();
        await this.loadServicos();
        this.setupEventListeners();
        this.setupPaymentToggle();
        this.setupRealtimeValidation();
    }

    // ============================================
    // CARREGAMENTO DE CLIENTES
    // ============================================
    async loadClientes() {
        try {
            console.log('📥 Carregando clientes...');
            const { data, error } = await supabase
                .from('clientes')
                .select('id, nome')
                .order('nome');

            if (error) throw error;

            this.clientes = data || [];
            console.log(`✅ ${this.clientes.length} clientes carregados`);
            this.populateClienteSelects();
        } catch (error) {
            console.error('❌ Erro ao carregar clientes:', error);
            this.showNotification('Erro ao carregar clientes!', 'error');
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
    // CARREGAMENTO DE SERVIÇOS
    // ============================================
    async loadServicos() {
        try {
            console.log('📥 Carregando serviços...', this.filters);
            
            let query = supabase
                .from('servicos')
                .select(`
                    *,
                    clientes:cliente_id(nome)
                `)
                .order('data', { ascending: false });

            if (this.filters.status && this.filters.status !== 'todos') {
                query = query.eq('status', this.filters.status);
            }

            if (this.filters.cliente) {
                query = query.eq('cliente_id', this.filters.cliente);
            }

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

            this.servicos = data || [];
            console.log(`✅ ${this.servicos.length} serviços carregados`);
            this.renderServicos();
            this.updateStats();

        } catch (error) {
            console.error('❌ Erro ao carregar serviços:', error);
            this.showNotification('Erro ao carregar serviços!', 'error');
            
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
    // RENDERIZAÇÃO DOS SERVIÇOS
    // ============================================
    renderServicos() {
        const container = document.getElementById('servicosList');
        if (!container) {
            console.warn('⚠️ Container servicosList não encontrado');
            return;
        }

        if (this.servicos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="briefcase" class="empty-icon"></i>
                    <h3>Nenhum serviço encontrado</h3>
                    <p style="color: var(--gray-500);">Clique em "Novo Serviço" para começar</p>
                    <button class="btn btn-primary" id="emptyNovoServicoBtn" style="margin-top: 16px;">
                        <i data-lucide="plus"></i>
                        Novo Serviço
                    </button>
                </div>
            `;
            
            if (window.lucide) lucide.createIcons();
            
            document.getElementById('emptyNovoServicoBtn')?.addEventListener('click', () => {
                this.openModal();
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

        // Event listeners para os botões
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
                if (window.showConfirm) {
                    window.showConfirm('Excluir este serviço?', () => {
                        this.deleteServico(id);
                    });
                } else {
                    this.deleteServico(id);
                }
            });
        });

        // Event listeners para os toggles de pagamento
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
    // TOGGLE DE PAGAMENTO
    // ============================================
    async togglePagamento(id, pago) {
        try {
            console.log(`💰 Alterando pagamento do serviço ${id} para ${pago ? 'PAGO' : 'NÃO PAGO'}`);
            
            const { error } = await supabase
                .from('servicos')
                .update({ pago: pago })
                .eq('id', id);

            if (error) throw error;

            this.showNotification(pago ? '✅ Pagamento registrado como recebido!' : '⏳ Pagamento marcado como pendente', 'success');
            await this.loadServicos();
        } catch (error) {
            console.error('❌ Erro ao atualizar pagamento:', error);
            this.showNotification('Erro ao atualizar pagamento: ' + error.message, 'error');
        }
    }

    setupPaymentToggle() {
        // Toggle do pagamento no modal
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
        // Validação do nome no modal
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

        // Validação da data
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

        // Validação do cliente
        const clienteSelect = document.getElementById('servicoCliente');
        const clienteError = document.getElementById('clienteError');
        const clienteStatus = document.getElementById('clienteStatus');
        const clienteHint = document.getElementById('clienteHint');

        if (clienteSelect) {
            clienteSelect.addEventListener('change', () => {
                if (clienteSelect.value) {
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

        // Máscara de valor
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

                const formatted = this.formatCurrency(numbers);
                valorInput.value = formatted;

                const parsed = this.parseCurrency(formatted);
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

        // Contador de caracteres da descrição
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
    // FUNÇÕES AUXILIARES DE FORMATAÇÃO
    // ============================================
    formatCurrency(value) {
        let cleaned = value.replace(/\D/g, '');
        if (cleaned === '') return '';
        let number = parseInt(cleaned) / 100;
        return number.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    parseCurrency(value) {
        if (!value) return null;
        let cleaned = value.replace(/[^\d,]/g, '').replace(',', '.');
        let number = parseFloat(cleaned);
        return isNaN(number) ? null : number;
    }

    // ============================================
    // ATUALIZAÇÃO DE ESTATÍSTICAS (LÓGICA CORRIGIDA)
    // ============================================
    updateStats() {
        const total = this.servicos.length;
        const concluidos = this.servicos.filter(s => s.status === 'concluido').length;
        const pendentes = this.servicos.filter(s => s.status === 'pendente').length;
        const valorTotal = this.servicos.reduce((sum, s) => sum + (s.valor || 0), 0);
        
        // ============================================
        // LÓGICA FINANCEIRA CORRIGIDA
        // Apenas serviços CONCLUÍDOS entram no fluxo financeiro
        // ============================================
        // Valor Recebido = serviços concluídos E pagos
        const valorRecebido = this.servicos
            .filter(s => s.status === 'concluido' && s.pago === true)
            .reduce((sum, s) => sum + (s.valor || 0), 0);
        
        // Valor a Receber = serviços concluídos E NÃO pagos
        // (Serviços pendentes NÃO entram no valor a receber)
        const valorAReceber = this.servicos
            .filter(s => s.status === 'concluido' && s.pago !== true)
            .reduce((sum, s) => sum + (s.valor || 0), 0);

        document.getElementById('totalServicos').textContent = total;
        document.getElementById('servicosConcluidos').textContent = concluidos;
        document.getElementById('servicosPendentes').textContent = pendentes;
        document.getElementById('valorTotalServicos').textContent = `R$ ${valorTotal.toFixed(2)}`;
        document.getElementById('valorRecebido').textContent = `R$ ${valorRecebido.toFixed(2)}`;
        document.getElementById('valorAReceber').textContent = `R$ ${valorAReceber.toFixed(2)}`;
    }

    // ============================================
    // CRUD - CREATE, UPDATE, DELETE
    // ============================================
    async createServico(data) {
        try {
            console.log('📝 Criando serviço:', data);
            const { error } = await supabase
                .from('servicos')
                .insert([data]);

            if (error) throw error;

            this.showNotification('Serviço criado com sucesso! 🎉', 'success');
            await this.loadServicos();
            this.closeModal();
        } catch (error) {
            console.error('❌ Erro ao criar serviço:', error);
            this.showNotification('Erro ao criar serviço: ' + error.message, 'error');
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

            this.showNotification('Serviço atualizado com sucesso! ✅', 'success');
            await this.loadServicos();
            this.closeModal();
        } catch (error) {
            console.error('❌ Erro ao atualizar serviço:', error);
            this.showNotification('Erro ao atualizar serviço: ' + error.message, 'error');
        }
    }

    async deleteServico(id) {
        try {
            console.log('🗑️ Excluindo serviço:', id);
            
            // Verificar se o serviço tem notas associadas
            const { data: notas, error: notasError } = await supabase
                .from('notas')
                .select('id')
                .eq('servico_id', id)
                .limit(1);

            if (notasError) throw notasError;

            if (notas && notas.length > 0) {
                this.showNotification('Este serviço possui notas associadas. Exclua as notas primeiro.', 'warning');
                return;
            }

            const { error } = await supabase
                .from('servicos')
                .delete()
                .eq('id', id);

            if (error) throw error;

            this.showNotification('Serviço excluído com sucesso! 🗑️', 'success');
            await this.loadServicos();
        } catch (error) {
            console.error('❌ Erro ao excluir serviço:', error);
            this.showNotification('Erro ao excluir serviço: ' + error.message, 'error');
        }
    }

    // ============================================
    // COMPLETAR SERVIÇO
    // ============================================
    async completeServico(id) {
        try {
            console.log('✅ Concluindo serviço:', id);
            
            // Buscar o serviço atual para verificar se já tem status
            const { data: servico, error: findError } = await supabase
                .from('servicos')
                .select('*')
                .eq('id', id)
                .single();

            if (findError) throw findError;

            // Se já estiver concluído, não fazer nada
            if (servico.status === 'concluido') {
                this.showNotification('Este serviço já está concluído!', 'warning');
                return;
            }

            const { error } = await supabase
                .from('servicos')
                .update({ 
                    status: 'concluido',
                    pago: false // Ao concluir, o pagamento começa como não pago
                })
                .eq('id', id);

            if (error) throw error;

            this.showNotification('Serviço concluído com sucesso! ✅', 'success');
            await this.loadServicos();
        } catch (error) {
            console.error('❌ Erro ao concluir serviço:', error);
            this.showNotification('Erro ao concluir serviço: ' + error.message, 'error');
        }
    }

    // ============================================
    // MODAL - ABRIR E FECHAR
    // ============================================
    openModal(data = null) {
        const modal = document.getElementById('servicoModal');
        if (!modal) return;

        this.populateClienteSelects();

        // Resetar estado do toggle de pagamento
        const pagoCheckbox = document.getElementById('servicoPago');
        const pagamentoStatusText = document.getElementById('pagamentoStatusText');
        const pagamentoSlider = document.getElementById('pagamentoSlider');

        // Resetar validações
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

            // Configurar toggle de pagamento
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

            // Atualizar contadores
            document.getElementById('nomeCounter').textContent = `${(data.servico || '').length}/100`;
            document.getElementById('descricaoCounter').textContent = `${(data.descricao || '').length}/500`;

            // Atualizar hints de validação
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

            // Resetar toggle de pagamento
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

            // Resetar contadores
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
        const valor = this.parseCurrency(valorRaw);
        const status = document.getElementById('servicoStatus').value;
        const pago = document.getElementById('servicoPago')?.checked || false;

        // Validações
        if (!clienteId) {
            this.showNotification('Selecione um cliente!', 'error');
            document.getElementById('servicoCliente').focus();
            return;
        }

        if (!nome) {
            this.showNotification('Informe o nome do serviço!', 'error');
            document.getElementById('servicoNome').focus();
            return;
        }

        if (!data) {
            this.showNotification('Informe a data!', 'error');
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
    // EVENTOS E NOTIFICAÇÕES
    // ============================================
    setupEventListeners() {
        console.log('✅ Event listeners configurados');
    }

    showNotification(message, type = 'info') {
        console.log(`📢 ${type}: ${message}`);
        // Será sobrescrito pelo HTML
    }
}