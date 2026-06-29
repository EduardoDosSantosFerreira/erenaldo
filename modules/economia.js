// modules/economia.js
import supabase from '../services/supabase.js';

export class EconomiaManager {
    constructor() {
        this.charts = {
            evolution: null,
            comparison: null,
            monthly: null
        };
        this.periodo = 'todos';
        this.anoSelecionado = 'todos';
        this.mesSelecionado = 'todos';
        this.servicos = [];
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando EconomiaManager...');
        await this.loadData();
        this.setupEvents();
        this.populateAnos();
        this.setupPrecosModal();
    }

    // ============================================
    // POPULAR ANOS NO SELECT
    // ============================================
    populateAnos() {
        const select = document.getElementById('anoSelector');
        if (!select) return;

        const anoAtual = new Date().getFullYear();
        const anos = [];
        for (let i = anoAtual; i >= anoAtual - 5; i--) {
            anos.push(i);
        }

        // Preservar a opção "Todos"
        const currentValue = select.value;
        select.innerHTML = `<option value="todos">Todos</option>`;
        anos.forEach(ano => {
            select.innerHTML += `<option value="${ano}">${ano}</option>`;
        });
        if (currentValue) select.value = currentValue;
    }

    // ============================================
    // TABELA DE PREÇOS
    // ============================================
    setupPrecosModal() {
        const helpBtn = document.getElementById('helpBtn');
        const modal = document.getElementById('precosModal');
        const closeBtns = ['closePrecosModal', 'closePrecosModalBtn'];

        // Dados da tabela
        const servicos = [
            { nome: 'Instalação de tomada', varejo: 85.00, atacado: 70.00 },
            { nome: 'Instalação de ar-condicionado', varejo: 350.00, atacado: 280.00 },
            { nome: 'Visita técnica', varejo: 120.00, atacado: 90.00 },
            { nome: 'Mão de obra', varejo: 150.00, atacado: 120.00 },
            { nome: 'Instalação de ventilador', varejo: 100.00, atacado: 80.00 },
            { nome: 'Limpeza de ar-condicionado', varejo: 180.00, atacado: 140.00 },
            { nome: 'Instalação de câmera', varejo: 200.00, atacado: 160.00 },
            { nome: 'Instalação de torneira', varejo: 90.00, atacado: 70.00 },
            { nome: 'Instalação de lâmpada', varejo: 55.00, atacado: 40.00 },
            { nome: 'Refazer instalação elétrica', varejo: 450.00, atacado: 350.00 },
            { nome: 'Troca de disjuntor', varejo: 75.00, atacado: 60.00 }
        ];

        helpBtn?.addEventListener('click', () => {
            // Preencher tabela
            const tbody = document.getElementById('precosTableBody');
            if (tbody) {
                tbody.innerHTML = servicos.map(s => `
                    <tr>
                        <td>${s.nome}</td>
                        <td class="preco-varejo">R$ ${s.varejo.toFixed(2)}</td>
                        <td class="preco-atacado">R$ ${s.atacado.toFixed(2)}</td>
                    </tr>
                `).join('');
            }
            modal.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
        });

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

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal?.style.display === 'flex') {
                modal.style.display = 'none';
            }
        });
    }

    // ============================================
    // CARREGAMENTO DE DADOS
    // ============================================
    async loadData() {
        try {
            console.log('📥 Carregando dados financeiros...');

            const { data: servicos, error } = await supabase
                .from('servicos')
                .select(`
                    *,
                    clientes:cliente_id(id, nome, telefone, email)
                `)
                .order('data', { ascending: true });

            if (error) throw error;

            this.servicos = servicos || [];

            // Aplicar filtros de período (ano/mês)
            const filtered = this.filterByPeriodAndDate(this.servicos);

            // Calcular métricas
            const metrics = this.calculateMetrics(filtered);

            this.updateStats(metrics);
            this.updateCharts(filtered);
            this.updateDebtors(filtered);
            this.updateRecebimentos(filtered);
            this.updatePendentes(filtered);

        } catch (error) {
            console.error('❌ Erro ao carregar dados:', error);
            window.showToast('Erro ao carregar dados financeiros!', 'error');
        }
    }

    // ============================================
    // FILTRO POR PERÍODO E DATA
    // ============================================
    filterByPeriodAndDate(servicos) {
        let filtered = [...servicos];

        // Filtro rápido (semana/mês/todos)
        const now = new Date();
        let startDate = null;

        switch (this.periodo) {
            case 'semana':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - now.getDay());
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'mes':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'todos':
            default:
                startDate = null;
                break;
        }

        if (startDate) {
            filtered = filtered.filter(s => {
                const data = new Date(s.data);
                return data >= startDate;
            });
        }

        // Filtro por ano
        if (this.anoSelecionado !== 'todos') {
            const ano = parseInt(this.anoSelecionado);
            filtered = filtered.filter(s => {
                const data = new Date(s.data);
                return data.getFullYear() === ano;
            });
        }

        // Filtro por mês
        if (this.mesSelecionado !== 'todos') {
            const mes = parseInt(this.mesSelecionado) - 1;
            filtered = filtered.filter(s => {
                const data = new Date(s.data);
                return data.getMonth() === mes;
            });
        }

        return filtered;
    }

    // ============================================
    // CÁLCULO DE MÉTRICAS
    // ============================================
    calculateMetrics(servicos) {
        const concluidos = servicos.filter(s => s.status === 'concluido');
        const recebidos = concluidos.filter(s => s.pago === true);
        const aReceber = concluidos.filter(s => s.pago !== true);

        const totalRecebido = recebidos.reduce((sum, s) => sum + (s.valor || 0), 0);
        const totalAReceber = aReceber.reduce((sum, s) => sum + (s.valor || 0), 0);
        const totalGeral = totalRecebido + totalAReceber;
        const percentualRecebido = totalGeral > 0 ? (totalRecebido / totalGeral) * 100 : 0;

        const ticketMedio = recebidos.length > 0 ? totalRecebido / recebidos.length : 0;

        const clientesInadimplentes = new Set();
        aReceber.forEach(s => {
            if (s.cliente_id) clientesInadimplentes.add(s.cliente_id);
        });

        const now = new Date();
        const emAtraso = aReceber.filter(s => {
            const data = new Date(s.data);
            const diff = (now - data) / (1000 * 60 * 60 * 24);
            return diff > 30;
        });

        return {
            totalRecebido,
            totalAReceber,
            totalGeral,
            percentualRecebido,
            recebidos,
            aReceber,
            servicos,
            ticketMedio,
            clientesInadimplentes: clientesInadimplentes.size,
            emAtraso: emAtraso.length
        };
    }

    // ============================================
    // ATUALIZAR STATS
    // ============================================
    updateStats(metrics) {
        document.getElementById('totalRecebido').textContent = `R$ ${metrics.totalRecebido.toFixed(2)}`;
        document.getElementById('totalAReceber').textContent = `R$ ${metrics.totalAReceber.toFixed(2)}`;
        document.getElementById('servicosPagos').textContent = metrics.recebidos.length;
        document.getElementById('clientesInadimplentes').textContent = metrics.clientesInadimplentes;
        document.getElementById('ticketMedio').textContent = `R$ ${metrics.ticketMedio.toFixed(2)}`;
        document.getElementById('emAtraso').textContent = metrics.emAtraso;

        document.getElementById('qsRecebido').textContent = `R$ ${metrics.totalRecebido.toFixed(2)}`;
        document.getElementById('qsAReceber').textContent = `R$ ${metrics.totalAReceber.toFixed(2)}`;
        document.getElementById('qsTotal').textContent = `R$ ${metrics.totalGeral.toFixed(2)}`;
        document.getElementById('qsPercentual').textContent = `${metrics.percentualRecebido.toFixed(1)}%`;
    }

    // ============================================
    // ATUALIZAR GRÁFICOS
    // ============================================
    updateCharts(servicos) {
        const concluidos = servicos.filter(s => s.status === 'concluido');

        // Gráfico de Evolução
        const grouped = this.groupByDate(concluidos);
        const labels = Object.keys(grouped).sort();
        const recebidoData = labels.map(d => grouped[d].recebido || 0);
        const aReceberData = labels.map(d => grouped[d].aReceber || 0);

        this.createEvolutionChart(labels, recebidoData, aReceberData);

        // Gráfico de Distribuição (Doughnut)
        const totalRecebido = recebidoData.reduce((a, b) => a + b, 0);
        const totalAReceber = aReceberData.reduce((a, b) => a + b, 0);
        this.createComparisonChart(totalRecebido, totalAReceber);

        // NOVO: Gráfico Mensal Comparativo
        this.createMonthlyChart(concluidos);
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

    // ============================================
    // GRÁFICO DE EVOLUÇÃO (LINHA)
    // ============================================
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
                            backgroundColor: 'rgba(76,175,80,0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointBackgroundColor: '#4CAF50'
                        },
                        {
                            label: 'A Receber',
                            data: [0],
                            borderColor: '#F57C00',
                            backgroundColor: 'rgba(245,124,0,0.1)',
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
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: { usePointStyle: true, padding: 20 }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.dataset.label + ': R$ ' + context.parsed.y.toFixed(2);
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: v => 'R$ ' + v.toFixed(2)
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
                        backgroundColor: 'rgba(76,175,80,0.12)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#4CAF50',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        borderWidth: 2.5
                    },
                    {
                        label: 'A Receber',
                        data: aReceberData,
                        borderColor: '#F57C00',
                        backgroundColor: 'rgba(245,124,0,0.12)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#F57C00',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        borderWidth: 2.5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { usePointStyle: true, padding: 20 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': R$ ' + context.parsed.y.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: v => 'R$ ' + v.toFixed(2)
                        }
                    }
                }
            }
        });
    }

    // ============================================
    // GRÁFICO DE DISTRIBUIÇÃO (DOUGHNUT)
    // ============================================
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
                    datasets: [{ data: [1], backgroundColor: ['#E0E0E0'], borderWidth: 0 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    cutout: '65%'
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
                    borderWidth: 3,
                    borderColor: '#fff',
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 16, usePointStyle: true, pointStyle: 'circle' }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? (context.parsed / total * 100).toFixed(1) : 0;
                                return context.label + ': R$ ' + context.parsed.toFixed(2) + ' (' + percentage + '%)';
                            }
                        }
                    }
                },
                cutout: '62%'
            }
        });
    }

    // ============================================
    // NOVO: GRÁFICO COMPARATIVO MENSAL
    // ============================================
    createMonthlyChart(servicos) {
        const ctx = document.getElementById('monthlyChart');
        if (!ctx) return;

        if (this.charts.monthly) {
            this.charts.monthly.destroy();
        }

        // Agrupar por mês
        const monthlyData = {};
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

        servicos.forEach(s => {
            const data = new Date(s.data);
            const key = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
            const label = `${monthNames[data.getMonth()]}/${data.getFullYear()}`;

            if (!monthlyData[key]) {
                monthlyData[key] = { label, recebido: 0, aReceber: 0 };
            }

            if (s.pago === true) {
                monthlyData[key].recebido += (s.valor || 0);
            } else {
                monthlyData[key].aReceber += (s.valor || 0);
            }
        });

        const sortedKeys = Object.keys(monthlyData).sort();
        const labels = sortedKeys.map(k => monthlyData[k].label);
        const recebidoData = sortedKeys.map(k => monthlyData[k].recebido);
        const aReceberData = sortedKeys.map(k => monthlyData[k].aReceber);

        // Atualizar legenda
        const subtitle = document.getElementById('comparativoSubtitle');
        if (subtitle) {
            const totalMeses = labels.length;
            subtitle.textContent = totalMeses > 0 ? `Faturamento por mês (${totalMeses} meses)` : 'Faturamento por mês';
        }

        if (labels.length === 0) {
            this.charts.monthly = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Sem dados'],
                    datasets: [
                        { label: 'Recebido', data: [0], backgroundColor: '#4CAF50', borderRadius: 4 },
                        { label: 'A Receber', data: [0], backgroundColor: '#F57C00', borderRadius: 4 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: { usePointStyle: true, padding: 16 }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { callback: v => 'R$ ' + v.toFixed(2) }
                        }
                    }
                }
            });
            return;
        }

        this.charts.monthly = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Recebido',
                        data: recebidoData,
                        backgroundColor: 'rgba(76, 175, 80, 0.75)',
                        borderColor: '#4CAF50',
                        borderWidth: 1.5,
                        borderRadius: 4,
                        barPercentage: 0.6
                    },
                    {
                        label: 'A Receber',
                        data: aReceberData,
                        backgroundColor: 'rgba(245, 124, 0, 0.75)',
                        borderColor: '#F57C00',
                        borderWidth: 1.5,
                        borderRadius: 4,
                        barPercentage: 0.6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { usePointStyle: true, padding: 16 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': R$ ' + context.parsed.y.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: v => 'R$ ' + v.toFixed(2)
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // ============================================
    // LISTAS
    // ============================================
    updateDebtors(servicos) {
        const container = document.getElementById('debtorsList');
        if (!container) return;

        const devedores = {};
        servicos.forEach(s => {
            if (s.status === 'concluido' && s.pago !== true) {
                const clienteId = s.cliente_id;
                if (!devedores[clienteId]) {
                    devedores[clienteId] = {
                        cliente: s.clientes,
                        servicos: [],
                        total: 0,
                        ultimaData: s.data
                    };
                }
                devedores[clienteId].servicos.push(s);
                devedores[clienteId].total += (s.valor || 0);
                if (s.data > devedores[clienteId].ultimaData) {
                    devedores[clienteId].ultimaData = s.data;
                }
            }
        });

        const list = Object.values(devedores).sort((a, b) => b.total - a.total);

        document.getElementById('debtorsCount').textContent = list.length;

        if (list.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="check-circle"></i>
                    <p>Nenhum cliente com pendência</p>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map(d => `
            <div class="list-item" onclick="window.economiaManager?.showClienteDetalhe('${d.cliente?.id}')">
                <div class="item-info">
                    <div class="item-name">${d.cliente?.nome || 'Cliente não identificado'}</div>
                    <div class="item-sub">
                        <span>${d.servicos.length} serviço(s) pendente(s)</span>
                        <span>Último: ${d.ultimaData}</span>
                    </div>
                </div>
                <div class="item-value danger">R$ ${d.total.toFixed(2)}</div>
            </div>
        `).join('');

        if (window.lucide) lucide.createIcons();
    }

    updateRecebimentos(servicos) {
        const container = document.getElementById('ultimosRecebimentos');
        if (!container) return;

        const recebidos = servicos
            .filter(s => s.status === 'concluido' && s.pago === true)
            .sort((a, b) => new Date(b.data) - new Date(a.data))
            .slice(0, 10);

        document.getElementById('recebimentosCount').textContent = recebidos.length;

        if (recebidos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="inbox"></i>
                    <p>Nenhum recebimento registrado</p>
                </div>
            `;
            return;
        }

        container.innerHTML = recebidos.map(s => `
            <div class="list-item">
                <div class="item-info">
                    <div class="item-name">${s.clientes?.nome || 'Cliente não identificado'}</div>
                    <div class="item-sub">
                        <span>${s.servico}</span>
                        <span class="badge success">Recebido</span>
                        <span>${s.data}</span>
                    </div>
                </div>
                <div class="item-value success">R$ ${(s.valor || 0).toFixed(2)}</div>
            </div>
        `).join('');
    }

    updatePendentes(servicos) {
        const container = document.getElementById('servicosPendentes');
        if (!container) return;

        const now = new Date();
        const pendentes = servicos
            .filter(s => s.status === 'concluido' && s.pago !== true)
            .sort((a, b) => new Date(a.data) - new Date(b.data));

        document.getElementById('pendentesCount').textContent = pendentes.length;

        if (pendentes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="check-circle"></i>
                    <p>Todos os serviços estão pagos!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = pendentes.map(s => {
            const data = new Date(s.data);
            const diff = Math.floor((now - data) / (1000 * 60 * 60 * 24));
            const emAtraso = diff > 30;
            const statusClass = emAtraso ? 'danger' : 'warning';
            const statusLabel = emAtraso ? `${diff} dias em atraso` : `${diff} dias pendente`;

            return `
                <div class="list-item" onclick="window.location.href='servicos.html?id=${s.id}'">
                    <div class="item-info">
                        <div class="item-name">${s.clientes?.nome || 'Cliente não identificado'}</div>
                        <div class="item-sub">
                            <span>${s.servico}</span>
                            <span class="badge ${statusClass}">${statusLabel}</span>
                            <span>${s.data}</span>
                        </div>
                    </div>
                    <div class="item-value danger">R$ ${(s.valor || 0).toFixed(2)}</div>
                    <div class="item-action">
                        <button class="btn" onclick="event.stopPropagation(); window.location.href='servicos.html?id=${s.id}'">
                            Ver
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    }

    // ============================================
    // MODAL DETALHES DO CLIENTE
    // ============================================
    async showClienteDetalhe(clienteId) {
        try {
            const { data: cliente, error: clienteError } = await supabase
                .from('clientes')
                .select('*')
                .eq('id', clienteId)
                .single();

            if (clienteError) throw clienteError;

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

    // ============================================
    // EVENTOS
    // ============================================
    setupEvents() {
        // Filtro rápido
        document.querySelectorAll('.filter-btn[data-periodo]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn[data-periodo]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.periodo = btn.dataset.periodo;
                this.loadData();
            });
        });

        // Filtro por Ano/Mês
        document.getElementById('aplicarFiltroPeriodoBtn')?.addEventListener('click', () => {
            this.anoSelecionado = document.getElementById('anoSelector')?.value || 'todos';
            this.mesSelecionado = document.getElementById('mesSelector')?.value || 'todos';
            this.loadData();
        });

        // Enter nos selects para aplicar
        document.querySelectorAll('#anoSelector, #mesSelector').forEach(select => {
            select?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('aplicarFiltroPeriodoBtn')?.click();
                }
            });
        });

        // Refresh
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            const btn = document.getElementById('refreshBtn');
            const icon = btn.querySelector('i');
            icon.style.animation = 'spin 0.8s linear infinite';
            this.loadData().finally(() => {
                icon.style.animation = 'none';
            });
        });

        // Fechar modais
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

// ============================================
// INICIALIZAÇÃO
// ============================================

window.economiaManager = null;

const initEconomia = async () => {
    try {
        const { AuthService } = await import('./auth.js');

        const user = await AuthService.checkAuth();
        if (user) {
            document.getElementById('userName').textContent = user.nome || 'Usuário';
            document.getElementById('userAvatar').textContent = (user.nome || 'U').charAt(0).toUpperCase();
        }

        if (window.lucide) lucide.createIcons();

        window.economiaManager = new EconomiaManager();

        console.log('✅ Economia inicializado!');
    } catch (error) {
        console.error('❌ Erro na inicialização:', error);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEconomia);
} else {
    initEconomia();
}