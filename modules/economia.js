// modules/economia.js
import supabase from '../services/supabase.js';

export class EconomiaManager {
    constructor() {
        this.charts = {
            evolution: null,
            comparison: null
        };
        this.periodo = 'semana';
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando EconomiaManager...');
        await this.loadData();
        this.setupEvents();
    }

    async loadData() {
        try {
            console.log('📥 Carregando dados financeiros...');

            // Buscar todos os serviços
            const { data: servicos, error } = await supabase
                .from('servicos')
                .select(`
                    *,
                    clientes:cliente_id(id, nome)
                `)
                .order('data', { ascending: true });

            if (error) throw error;

            // Filtrar por período
            const filtered = this.filterByPeriod(servicos || []);
            
            // Calcular métricas com a nova lógica
            const metrics = this.calculateMetrics(filtered);
            
            // Atualizar stats
            this.updateStats(metrics);
            
            // Atualizar gráficos
            this.updateCharts(filtered);
            
            // Atualizar lista de devedores
            this.updateDebtors(filtered);

        } catch (error) {
            console.error('❌ Erro ao carregar dados:', error);
            window.showToast('Erro ao carregar dados financeiros!', 'error');
        }
    }

    filterByPeriod(servicos) {
        const now = new Date();
        let startDate = new Date();

        switch (this.periodo) {
            case 'semana':
                startDate.setDate(now.getDate() - now.getDay());
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'mes':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'todos':
            default:
                return servicos;
        }

        return servicos.filter(s => {
            const data = new Date(s.data);
            return data >= startDate;
        });
    }

    calculateMetrics(servicos) {
        // ============================================
        // NOVA LÓGICA FINANCEIRA
        // ============================================
        // Apenas serviços CONCLUÍDOS entram no fluxo financeiro
        // Pendentes e Cancelados NÃO são contabilizados

        // Serviços concluídos (base para tudo)
        const concluidos = servicos.filter(s => s.status === 'concluido');
        
        // Serviços concluídos E pagos = RECEBIDO
        const recebidos = concluidos.filter(s => s.pago === true);
        const totalRecebido = recebidos.reduce((sum, s) => sum + (s.valor || 0), 0);

        // Serviços concluídos E NÃO pagos = A RECEBER
        const aReceber = concluidos.filter(s => s.pago !== true);
        const totalAReceber = aReceber.reduce((sum, s) => sum + (s.valor || 0), 0);

        // Total de serviços concluídos (recebidos + a receber)
        const totalGeral = totalRecebido + totalAReceber;

        // Percentual recebido (apenas sobre serviços concluídos)
        const percentualRecebido = totalGeral > 0 ? (totalRecebido / totalGeral) * 100 : 0;

        // Estatísticas adicionais
        const totalPendentes = servicos.filter(s => s.status === 'pendente').length;
        const totalCancelados = servicos.filter(s => s.status === 'cancelado').length;
        const totalConcluidos = concluidos.length;

        return {
            totalRecebido,
            totalAReceber,
            totalGeral,
            percentualRecebido,
            recebidos,
            aReceber,
            servicos,
            totalPendentes,
            totalCancelados,
            totalConcluidos
        };
    }

    updateStats(metrics) {
        document.getElementById('totalRecebido').textContent = `R$ ${metrics.totalRecebido.toFixed(2)}`;
        document.getElementById('totalAReceber').textContent = `R$ ${metrics.totalAReceber.toFixed(2)}`;
        document.getElementById('totalGeral').textContent = `R$ ${metrics.totalGeral.toFixed(2)}`;
        document.getElementById('percentualRecebido').textContent = `${metrics.percentualRecebido.toFixed(1)}%`;
    }

    updateCharts(servicos) {
        // Agrupar apenas serviços concluídos por data
        const concluidos = servicos.filter(s => s.status === 'concluido');
        const grouped = this.groupByDate(concluidos);
        const labels = Object.keys(grouped).sort();
        
        // Separar recebidos e a receber
        const recebidoData = labels.map(d => grouped[d].recebido || 0);
        const aReceberData = labels.map(d => grouped[d].aReceber || 0);

        // Gráfico de Evolução
        this.createEvolutionChart(labels, recebidoData, aReceberData);

        // Gráfico de Comparação
        const totalRecebido = recebidoData.reduce((a, b) => a + b, 0);
        const totalAReceber = aReceberData.reduce((a, b) => a + b, 0);
        this.createComparisonChart(totalRecebido, totalAReceber);
    }

    groupByDate(servicos) {
        const grouped = {};

        servicos.forEach(s => {
            const data = s.data;
            if (!grouped[data]) {
                grouped[data] = { recebido: 0, aReceber: 0 };
            }

            if (s.pago === true) {
                grouped[data].recebido += (s.valor || 0);
            } else {
                grouped[data].aReceber += (s.valor || 0);
            }
        });

        return grouped;
    }

    createEvolutionChart(labels, recebidoData, aReceberData) {
        const ctx = document.getElementById('evolutionChart');
        if (!ctx) return;

        if (this.charts.evolution) {
            this.charts.evolution.destroy();
        }

        if (labels.length === 0) {
            this.charts.evolution = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['Sem dados'],
                    datasets: [
                        {
                            label: 'Recebido',
                            data: [0],
                            borderColor: '#4CAF50',
                            backgroundColor: 'rgba(76, 175, 80, 0.1)',
                            fill: true,
                            tension: 0.4
                        },
                        {
                            label: 'A Receber',
                            data: [0],
                            borderColor: '#F57C00',
                            backgroundColor: 'rgba(245, 124, 0, 0.1)',
                            fill: true,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return 'R$ ' + value.toFixed(2);
                                }
                            }
                        }
                    }
                }
            });
            return;
        }

        const formattedLabels = labels.map(d => {
            const date = new Date(d + 'T00:00:00');
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        });

        this.charts.evolution = new Chart(ctx, {
            type: 'line',
            data: {
                labels: formattedLabels,
                datasets: [
                    {
                        label: 'Recebido',
                        data: recebidoData,
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#4CAF50'
                    },
                    {
                        label: 'A Receber',
                        data: aReceberData,
                        borderColor: '#F57C00',
                        backgroundColor: 'rgba(245, 124, 0, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#F57C00'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
    }

    createComparisonChart(totalRecebido, totalAReceber) {
        const ctx = document.getElementById('comparisonChart');
        if (!ctx) return;

        if (this.charts.comparison) {
            this.charts.comparison.destroy();
        }

        if (totalRecebido === 0 && totalAReceber === 0) {
            this.charts.comparison = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Sem dados'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['#E0E0E0'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });
            return;
        }

        this.charts.comparison = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Recebido', 'A Receber'],
                datasets: [{
                    data: [totalRecebido, totalAReceber],
                    backgroundColor: ['#4CAF50', '#F57C00'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    }
                },
                cutout: '60%'
            }
        });
    }

    updateDebtors(servicos) {
        const tbody = document.getElementById('debtorsBody');
        if (!tbody) return;

        // ============================================
        // NOVA LÓGICA: Apenas serviços CONCLUÍDOS e NÃO PAGOS
        // ============================================
        // Filtrar apenas serviços concluídos e não pagos
        const devedores = {};

        servicos.forEach(s => {
            // Apenas serviços CONCLUÍDOS e NÃO PAGOS
            if (s.status === 'concluido' && s.pago !== true) {
                const clienteId = s.cliente_id;
                if (!devedores[clienteId]) {
                    devedores[clienteId] = {
                        cliente: s.clientes,
                        servicos: [],
                        total: 0
                    };
                }
                devedores[clienteId].servicos.push(s);
                devedores[clienteId].total += (s.valor || 0);
            }
        });

        const debtorsList = Object.values(devedores).sort((a, b) => b.total - a.total);

        document.getElementById('debtorsCount').textContent = debtorsList.length;

        if (debtorsList.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="4">🎉 Nenhum cliente com pagamento pendente!</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = debtorsList.map(d => `
            <tr>
                <td>
                    <a class="cliente-link" data-cliente-id="${d.cliente?.id}" onclick="window.economiaManager?.showClienteDetalhe('${d.cliente?.id}')">
                        ${d.cliente?.nome || 'Cliente não identificado'}
                    </a>
                </td>
                <td class="valor-devido">R$ ${d.total.toFixed(2)}</td>
                <td>${d.servicos.length}</td>
                <td><span class="badge-pendente">⚠️ Pendente</span></td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.cliente-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const id = link.dataset.clienteId;
                this.showClienteDetalhe(id);
            });
        });
    }

    async showClienteDetalhe(clienteId) {
        try {
            console.log('📋 Buscando detalhes do cliente:', clienteId);

            const { data: cliente, error: clienteError } = await supabase
                .from('clientes')
                .select('*')
                .eq('id', clienteId)
                .single();

            if (clienteError) throw clienteError;

            // Buscar serviços CONCLUÍDOS e NÃO PAGOS deste cliente
            const { data: servicos, error: servicosError } = await supabase
                .from('servicos')
                .select('*')
                .eq('cliente_id', clienteId)
                .eq('status', 'concluido')
                .eq('pago', false)
                .order('data', { ascending: false });

            if (servicosError) throw servicosError;

            const pendentes = servicos || [];
            const totalPendente = pendentes.reduce((sum, s) => sum + (s.valor || 0), 0);

            document.getElementById('detalheModalTitle').textContent = `Serviços Pendentes - ${cliente.nome}`;
            document.getElementById('detalheClienteNome').textContent = cliente.nome;
            document.getElementById('detalheAvatar').textContent = cliente.nome.charAt(0).toUpperCase();
            document.getElementById('detalheTotalDevido').textContent = `R$ ${totalPendente.toFixed(2)}`;
            document.getElementById('detalheTotalPendente').textContent = `R$ ${totalPendente.toFixed(2)}`;
            document.getElementById('detalheClienteInfo').innerHTML = `
                Total devido: <strong style="color: #f44336;">R$ ${totalPendente.toFixed(2)}</strong>
                ${cliente.telefone ? ` • 📞 ${cliente.telefone}` : ''}
                ${cliente.email ? ` • ✉️ ${cliente.email}` : ''}
            `;

            const listContainer = document.getElementById('detalheServicosList');

            if (pendentes.length === 0) {
                listContainer.innerHTML = `
                    <div style="text-align: center; color: var(--gray-400); padding: 20px;">
                        ✅ Nenhum serviço pendente para este cliente!
                    </div>
                `;
            } else {
                listContainer.innerHTML = pendentes.map(s => `
                    <div class="servico-pendente-item">
                        <div class="servico-info">
                            <span class="nome">${s.servico}</span>
                            <span class="data">📅 ${s.data} ✅ Concluído</span>
                        </div>
                        <span class="servico-valor">R$ ${(s.valor || 0).toFixed(2)}</span>
                    </div>
                `).join('');
            }

            document.getElementById('clienteDetalheModal').style.display = 'flex';
            if (window.lucide) lucide.createIcons();

        } catch (error) {
            console.error('❌ Erro ao buscar detalhes:', error);
            window.showToast('Erro ao carregar detalhes do cliente!', 'error');
        }
    }

    setupEvents() {
        document.querySelectorAll('.btn-filter[data-periodo]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-filter[data-periodo]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.periodo = btn.dataset.periodo;
                this.loadData();
            });
        });

        document.getElementById('refreshEconomiaBtn')?.addEventListener('click', () => {
            const btn = document.getElementById('refreshEconomiaBtn');
            const icon = btn.querySelector('i');
            icon.style.animation = 'spin 0.8s linear infinite';
            this.loadData().finally(() => {
                icon.style.animation = 'none';
            });
        });

        const closeButtons = ['closeDetalheModal', 'closeDetalheModalBtn'];
        closeButtons.forEach(id => {
            document.getElementById(id)?.addEventListener('click', () => {
                document.getElementById('clienteDetalheModal').style.display = 'none';
            });
        });

        document.getElementById('clienteDetalheModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                document.getElementById('clienteDetalheModal').style.display = 'none';
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.getElementById('clienteDetalheModal').style.display = 'none';
            }
        });
    }
}