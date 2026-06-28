// modules/dashboard.js
import supabase from '../services/supabase.js';

export class Dashboard {
    constructor() {
        this.calendar = null;
        this.servicos = [];
        this.init();
    }

    async init() {
        await this.loadData();
        await this.initCalendar();
        this.setupEventListeners();
        this.setupCardNavigation();
    }

    // ============================================
    // CARREGAMENTO DE DADOS
    // ============================================
    async loadData() {
        try {
            console.log('📥 Carregando dados do dashboard...');

            // Buscar todos os dados necessários
            const [
                clientes,
                servicos,
                servicosConcluidos,
                servicosPendentes,
                servicosCancelados,
                notas,
                servicosComValor
            ] = await Promise.all([
                supabase.from('clientes').select('*', { count: 'exact', head: true }),
                supabase.from('servicos').select('*', { count: 'exact', head: true }),
                supabase.from('servicos').select('*', { count: 'exact', head: true }).eq('status', 'concluido'),
                supabase.from('servicos').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
                supabase.from('servicos').select('*', { count: 'exact', head: true }).eq('status', 'cancelado'),
                supabase.from('notas').select('*', { count: 'exact', head: true }),
                supabase.from('servicos').select(`
                    *,
                    clientes:cliente_id(id, nome, telefone, email)
                `)
            ]);

            // Calcular valores financeiros
            const valorRecebido = servicosComValor.data
                ?.filter(s => s.status === 'concluido' && s.pago === true)
                ?.reduce((sum, s) => sum + (s.valor || 0), 0) || 0;

            const valorAReceber = servicosComValor.data
                ?.filter(s => s.status === 'concluido' && s.pago !== true)
                ?.reduce((sum, s) => sum + (s.valor || 0), 0) || 0;

            const totalGeral = valorRecebido + valorAReceber;
            const percentualRecebido = totalGeral > 0 ? (valorRecebido / totalGeral) * 100 : 0;

            // Armazenar serviços
            this.servicos = servicosComValor.data || [];

            // Atualizar cards
            this.updateStats({
                clientes: clientes.count || 0,
                servicos: servicos.count || 0,
                servicosConcluidos: servicosConcluidos.count || 0,
                servicosPendentes: servicosPendentes.count || 0,
                servicosCancelados: servicosCancelados.count || 0,
                notas: notas.count || 0,
                valorRecebido,
                valorAReceber
            });

            // Atualizar resumo financeiro
            document.getElementById('resumoRecebido').textContent = `R$ ${valorRecebido.toFixed(2)}`;
            document.getElementById('resumoAReceber').textContent = `R$ ${valorAReceber.toFixed(2)}`;
            document.getElementById('resumoTotal').textContent = `R$ ${totalGeral.toFixed(2)}`;
            document.getElementById('resumoPercentual').textContent = `${percentualRecebido.toFixed(1)}%`;

            // Renderizar listas
            this.renderUltimosServicos(servicosComValor.data || []);
            this.renderProximosServicos(servicosComValor.data || []);
            this.renderTimeline();

            console.log('✅ Dashboard carregado com sucesso!');

        } catch (error) {
            console.error('❌ Erro ao carregar dashboard:', error);
            this.showNotification('Erro ao carregar dados!', 'error');
        }
    }

    // ============================================
    // ATUALIZAÇÃO DE STATS
    // ============================================
    updateStats(data) {
        const elements = {
            totalClientes: data.clientes,
            totalServicos: data.servicos,
            servicosConcluidos: data.servicosConcluidos,
            servicosPendentes: data.servicosPendentes,
            servicosCancelados: data.servicosCancelados,
            totalNotas: data.notas,
            valorRecebido: `R$ ${data.valorRecebido.toFixed(2)}`,
            valorAReceber: `R$ ${data.valorAReceber.toFixed(2)}`
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    }

    // ============================================
    // NAVEGAÇÃO DOS CARDS
    // ============================================
    setupCardNavigation() {
        document.querySelectorAll('.card-indicator').forEach(card => {
            card.addEventListener('click', () => {
                const url = card.dataset.url;
                if (url) window.location.href = url;
            });
        });
    }

    // ============================================
    // RENDERIZAÇÃO DOS ÚLTIMOS SERVIÇOS
    // ============================================
    renderUltimosServicos(servicos) {
        const container = document.getElementById('ultimosServicos');
        if (!container) return;

        const ultimos = servicos
            .sort((a, b) => new Date(b.data) - new Date(a.data))
            .slice(0, 5);

        if (ultimos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="inbox"></i>
                    <p>Nenhum serviço registrado</p>
                </div>
            `;
            return;
        }

        const statusLabels = {
            'pendente': 'Pendente',
            'concluido': 'Concluído',
            'cancelado': 'Cancelado'
        };

        container.innerHTML = ultimos.map(s => {
            const isPago = s.pago === true;
            const valorClass = (s.status === 'concluido' && isPago) ? 'pago' : 'pendente';
            
            return `
            <div class="servico-item" onclick="window.dashboard?.goToServico('${s.id}')">
                <div class="servico-info">
                    <span class="servico-nome">${s.servico}</span>
                    <span class="servico-cliente">👤 ${s.clientes?.nome || 'Cliente não informado'}</span>
                </div>
                <div class="servico-meta">
                    ${s.valor ? `<span class="servico-valor ${valorClass}">R$ ${s.valor.toFixed(2)}</span>` : ''}
                    <span class="servico-status ${s.status}">${statusLabels[s.status] || s.status}</span>
                    <span class="servico-data">📅 ${s.data}</span>
                </div>
            </div>
        `}).join('');
    }

    // ============================================
    // RENDERIZAÇÃO DOS PRÓXIMOS SERVIÇOS
    // ============================================
    renderProximosServicos(servicos) {
        const container = document.getElementById('proximosServicos');
        if (!container) return;

        const hoje = new Date().toISOString().split('T')[0];
        const proximos = servicos
            .filter(s => s.status === 'pendente' || s.status === 'agendado')
            .filter(s => s.data >= hoje)
            .sort((a, b) => new Date(a.data) - new Date(b.data))
            .slice(0, 5);

        if (proximos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="inbox"></i>
                    <p>Nenhum serviço agendado</p>
                </div>
            `;
            return;
        }

        container.innerHTML = proximos.map(s => `
            <div class="servico-item" onclick="window.dashboard?.goToServico('${s.id}')">
                <div class="servico-info">
                    <span class="servico-nome">${s.servico}</span>
                    <span class="servico-cliente">👤 ${s.clientes?.nome || 'Cliente não informado'}</span>
                </div>
                <div class="servico-meta">
                    <span class="servico-data">📅 ${s.data}</span>
                    ${s.hora ? `<span class="servico-hora">🕐 ${s.hora}</span>` : ''}
                    <span class="servico-status ${s.status}">${s.status === 'pendente' ? 'Pendente' : 'Agendado'}</span>
                </div>
            </div>
        `).join('');
    }

    // ============================================
    // TIMELINE
    // ============================================
    renderTimeline() {
        const container = document.getElementById('timelineContent');
        if (!container) return;

        // Criar eventos da timeline
        const eventos = [];

        // Serviços criados
        this.servicos.forEach(s => {
            eventos.push({
                data: s.created_at || s.data,
                tipo: 'servico_criado',
                descricao: `Serviço "${s.servico}" criado para ${s.clientes?.nome || 'cliente'}`,
                link: `servicos.html?id=${s.id}`,
                icone: 'briefcase',
                cor: 'blue'
            });

            if (s.status === 'concluido') {
                eventos.push({
                    data: s.updated_at || s.data,
                    tipo: 'servico_concluido',
                    descricao: `Serviço "${s.servico}" concluído para ${s.clientes?.nome || 'cliente'}`,
                    link: `servicos.html?id=${s.id}`,
                    icone: 'check-circle',
                    cor: 'green'
                });
            }

            if (s.pago === true && s.status === 'concluido') {
                eventos.push({
                    data: s.updated_at || s.data,
                    tipo: 'pagamento_recebido',
                    descricao: `Pagamento de R$ ${(s.valor || 0).toFixed(2)} recebido de ${s.clientes?.nome || 'cliente'}`,
                    link: `servicos.html?id=${s.id}`,
                    icone: 'dollar-sign',
                    cor: 'green'
                });
            }
        });

        // Ordenar por data (mais recentes primeiro)
        eventos.sort((a, b) => new Date(b.data) - new Date(a.data));
        const recentes = eventos.slice(0, 10);

        if (recentes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="inbox"></i>
                    <p>Nenhuma atividade recente</p>
                </div>
            `;
            return;
        }

        container.innerHTML = recentes.map(e => `
            <div class="timeline-item">
                <div class="timeline-icon ${e.cor}">
                    <i data-lucide="${e.icone}"></i>
                </div>
                <div class="timeline-content">
                    <div class="timeline-text">${e.descricao}</div>
                    <div class="timeline-time">${this.formatarData(e.data)}</div>
                    <a href="${e.link}" class="timeline-link">Ver detalhes</a>
                </div>
            </div>
        `).join('');

        if (window.lucide) lucide.createIcons();
    }

    formatarData(data) {
        if (!data) return 'Data desconhecida';
        const date = new Date(data);
        const now = new Date();
        const diff = Math.floor((now - date) / (1000 * 60));

        if (diff < 1) return 'Agora mesmo';
        if (diff < 60) return `${diff} min atrás`;
        if (diff < 1440) return `${Math.floor(diff / 60)}h atrás`;
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    // ============================================
    // GO TO SERVIÇO
    // ============================================
    goToServico(servicoId) {
        if (!servicoId) return;
        window.location.href = `servicos.html?id=${servicoId}`;
    }

    // ============================================
    // CALENDÁRIO
    // ============================================
    getEvents() {
        return this.servicos.map(s => {
            const statusColors = {
                'pendente': '#F57C00',
                'concluido': '#4CAF50',
                'cancelado': '#f44336'
            };

            return {
                id: String(s.id),
                title: s.servico || 'Serviço',
                start: s.data,
                extendedProps: {
                    ...s,
                    clienteNome: s.clientes?.nome || 'Cliente'
                },
                backgroundColor: statusColors[s.status] || '#B71C1C',
                borderColor: statusColors[s.status] || '#B71C1C',
                textColor: '#FFFFFF',
                classNames: ['fc-event-clickable']
            };
        });
    }

    async initCalendar() {
        const calendarEl = document.getElementById('calendar');
        if (!calendarEl) return;

        if (typeof FullCalendar === 'undefined') {
            await new Promise(resolve => {
                const check = () => {
                    if (typeof FullCalendar !== 'undefined') resolve();
                    else setTimeout(check, 100);
                };
                check();
            });
        }

        const events = this.getEvents();

        this.calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: false,
            events: events,
            editable: false,
            selectable: true,
            dayMaxEvents: 3,
            weekends: true,
            eventClick: this.handleEventClick.bind(this),
            dateClick: this.handleDateClick.bind(this),
            eventDidMount: this.handleEventMount.bind(this),
            dayCellDidMount: this.handleDayCellMount.bind(this),
            eventTimeFormat: {
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false
            },
            views: {
                dayGridMonth: {
                    dayMaxEvents: 4
                }
            }
        });

        this.calendar.render();
        this.updateCalendarTitle();

        // Selecionar hoje
        this.selectDate(new Date());
    }

    updateCalendarTitle() {
        if (!this.calendar) return;
        const view = this.calendar.view;
        const titleEl = document.getElementById('calendarTitle');
        if (!titleEl) return;

        if (view.type === 'dayGridMonth') {
            const date = view.activeStart;
            titleEl.textContent = date.toLocaleDateString('pt-BR', {
                month: 'long',
                year: 'numeric'
            });
        }
    }

    handleEventClick(info) {
        const eventId = info.event.id;
        if (eventId) this.goToServico(eventId);
    }

    handleDateClick(info) {
        this.selectDate(info.date);
    }

    handleEventMount(info) {
        const props = info.event.extendedProps;
        if (props) {
            info.el.title = `${props.servico} - ${props.clienteNome}`;
            info.el.style.cursor = 'pointer';
        }
    }

    handleDayCellMount(info) {
        const dateStr = info.date.toISOString().split('T')[0];
        const hasEvents = this.servicos.some(s => s.data === dateStr);
        if (hasEvents) {
            info.el.classList.add('has-events');
        }
    }

    selectDate(date) {
        const dateStr = date.toISOString().split('T')[0];
        const dayEvents = this.servicos.filter(s => s.data === dateStr);

        // Atualizar título do dia
        const selectedDateEl = document.getElementById('selectedDate');
        if (selectedDateEl) {
            selectedDateEl.innerHTML = `<strong>${date.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            })}</strong>`;
        }

        // Mostrar eventos do dia no detalhe (já existe na seção de atividades)
        const dayDetails = document.getElementById('dayDetailsContent');
        if (dayDetails) {
            if (dayEvents.length === 0) {
                dayDetails.innerHTML = `
                    <div class="empty-day">
                        <span class="empty-icon">📭</span>
                        <h4>Nenhum serviço neste dia</h4>
                        <p>Não há atividades registradas para ${date.toLocaleDateString('pt-BR', {
                            day: 'numeric',
                            month: 'long'
                        })}</p>
                    </div>
                `;
            } else {
                const statusLabels = {
                    'pendente': 'Pendente',
                    'concluido': 'Concluído',
                    'cancelado': 'Cancelado'
                };

                dayDetails.innerHTML = dayEvents.map(s => `
                    <div class="day-event-item" onclick="window.dashboard?.goToServico('${s.id}')">
                        <div class="event-header">
                            <span class="event-title">${s.servico}</span>
                            <span class="event-status ${s.status}">${statusLabels[s.status]}</span>
                        </div>
                        <div class="event-body">
                            <span class="event-info">
                                <i data-lucide="user"></i>
                                <strong>${s.clientes?.nome || 'Cliente não informado'}</strong>
                            </span>
                            ${s.hora ? `<span class="event-info"><i data-lucide="clock"></i> ${s.hora}</span>` : ''}
                            ${s.valor ? `<span class="event-info event-valor">R$ ${s.valor.toFixed(2)}</span>` : ''}
                        </div>
                    </div>
                `).join('');

                if (window.lucide) lucide.createIcons();
            }
        }
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Navegação do calendário
        document.getElementById('prevBtn')?.addEventListener('click', () => {
            if (this.calendar) {
                this.calendar.prev();
                this.updateCalendarTitle();
            }
        });

        document.getElementById('nextBtn')?.addEventListener('click', () => {
            if (this.calendar) {
                this.calendar.next();
                this.updateCalendarTitle();
            }
        });

        document.getElementById('todayBtn')?.addEventListener('click', () => {
            if (this.calendar) {
                this.calendar.today();
                this.updateCalendarTitle();
                this.selectDate(new Date());
            }
        });

        // Refresh
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                // Deixar o navegador fazer refresh
            }
        });
    }

    // ============================================
    // NOTIFICAÇÕES
    // ============================================
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
}

// Inicializar
window.dashboard = null;

document.addEventListener('DOMContentLoaded', () => {
    // Mostrar loading
    const loading = document.getElementById('loadingDashboard');
    const data = document.getElementById('dashboardData');

    // Inicializar dashboard
    window.dashboard = new Dashboard();

    // Esconder loading e mostrar dados
    setTimeout(() => {
        if (loading) loading.style.display = 'none';
        if (data) data.style.display = 'block';
    }, 500);
});