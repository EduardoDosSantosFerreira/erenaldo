// modules/economia.js
import supabase from '../services/supabase.js';

export class EconomiaManager {
    constructor() {
        this.charts = {
            evolution: null,
            comparison: null
        };
        this.periodo = 'todos';
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

            const { data: servicos, error } = await supabase
                .from('servicos')
                .select(`
                    *,
                    clientes:cliente_id(id, nome, telefone, email)
                `)
                .order('data', { ascending: true });

            if (error) throw error;

            const filtered = this.filterByPeriod(servicos || []);
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

    updateCharts(servicos) {
        const concluidos = servicos.filter(s => s.status === 'concluido');
        const grouped = this.groupByDate(concluidos);
        const labels = Object.keys(grouped).sort();

        const recebidoData = labels.map(d => grouped[d].recebido || 0);
        const aReceberData = labels.map(d => grouped[d].aReceber || 0);

        this.createEvolutionChart(labels, recebidoData, aReceberData);

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
                            backgroundColor: 'rgba(76,175,80,0.1)',
                            fill: true,
                            tension: 0.4
                        },
                        {
                            label: 'A Receber',
                            data: [0],
                            borderColor: '#F57C00',
                            backgroundColor: 'rgba(245,124,0,0.1)',
                            fill: true,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' } },
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
                        backgroundColor: 'rgba(76,175,80,0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#4CAF50'
                    },
                    {
                        label: 'A Receber',
                        data: aReceberData,
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
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: v => 'R$ ' + v.toFixed(2) }
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
                    datasets: [{ data: [1], backgroundColor: ['#E0E0E0'], borderWidth: 0 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } }
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
                        labels: { padding: 15, usePointStyle: true, pointStyle: 'circle' }
                    }
                },
                cutout: '60%'
            }
        });
    }

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

    setupEvents() {
        document.querySelectorAll('.filter-btn[data-periodo]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn[data-periodo]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.periodo = btn.dataset.periodo;
                this.loadData();
            });
        });

        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            const btn = document.getElementById('refreshBtn');
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

window.economiaManager = null;

document.addEventListener('DOMContentLoaded', () => {
    window.economiaManager = new EconomiaManager();
});