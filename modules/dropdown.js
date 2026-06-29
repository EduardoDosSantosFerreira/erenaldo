// ============================================
// DROPDOWN GLOBAL DO USUÁRIO
// ============================================

/**
 * Configura o dropdown do usuário em qualquer página
 * Deve ser chamado após o DOM estar carregado
 * 
 * @param {Object} supabase - Instância do Supabase client
 * @param {string} logoutRedirect - URL para redirecionar após logout (padrão: '/login.html')
 * @param {string} gestaoUrl - URL da página de gestão (padrão: 'gestao.html')
 */
function setupUserDropdown(supabase, logoutRedirect = '/login.html', gestaoUrl = 'gestao.html') {
    const avatar = document.getElementById('userAvatar');
    const dropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');
    const gestaoLink = document.querySelector('.dropdown-item[href="gestao.html"]');

    // Se não encontrar os elementos, não faz nada
    if (!avatar || !dropdown) {
        console.warn('⚠️ Elementos do dropdown não encontrados');
        return;
    }

    // ============================================
    // ABRIR/FECHAR DROPDOWN
    // ============================================

    // Clique no avatar
    avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
        
        // Fechar outros dropdowns abertos (se houver)
        document.querySelectorAll('.user-dropdown.active').forEach(el => {
            if (el !== dropdown) {
                el.classList.remove('active');
            }
        });
    });

    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !avatar.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    // Fechar com ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdown.classList.remove('active');
        }
    });

    // Fechar ao rolar a página
    document.addEventListener('scroll', () => {
        dropdown.classList.remove('active');
    });

    // ============================================
    // REDIRECIONAR PARA GESTÃO
    // ============================================

    // Buscar o link de gestão
    let gestaoItem = gestaoLink;
    if (!gestaoItem) {
        // Se não encontrar o link, procurar por qualquer elemento com texto "Gestão"
        gestaoItem = document.querySelector('.dropdown-item:has(i[data-lucide="settings"])');
        if (!gestaoItem) {
            gestaoItem = document.querySelector('.dropdown-item[data-action="gestao"]');
        }
    }

    if (gestaoItem) {
        gestaoItem.addEventListener('click', (e) => {
            e.preventDefault();
            dropdown.classList.remove('active');
            window.location.href = gestaoUrl;
        });
    }

    // ============================================
    // LOGOUT
    // ============================================

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            dropdown.classList.remove('active');

            // Mostrar feedback visual (opcional)
            const originalText = logoutBtn.innerHTML;
            logoutBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Saindo...';
            logoutBtn.disabled = true;

            try {
                // Verificar se o Supabase está disponível
                if (supabase && typeof supabase.auth !== 'undefined') {
                    await supabase.auth.signOut();
                } else {
                    // Fallback: tentar usar o Supabase global
                    if (window.supabase) {
                        await window.supabase.auth.signOut();
                    }
                }

                // Limpar dados locais
                localStorage.removeItem('erenaldo_user');
                localStorage.removeItem('supabase.auth.token');

                // Redirecionar
                window.location.href = logoutRedirect;

            } catch (error) {
                console.error('❌ Erro ao sair:', error);
                
                // Restaurar botão
                logoutBtn.innerHTML = originalText;
                logoutBtn.disabled = false;

                // Mostrar erro
                if (window.showToast) {
                    window.showToast('Erro ao sair! Tente novamente.', 'error');
                } else {
                    alert('Erro ao sair! Tente novamente.');
                }
            }
        });
    }

    // ============================================
    // ATALHO DE TECLADO PARA ABRIR (opcional)
    // ============================================

    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+U ou Alt+U para abrir o dropdown
        if ((e.ctrlKey && e.shiftKey && e.key === 'u') || (e.altKey && e.key === 'u')) {
            e.preventDefault();
            dropdown.classList.toggle('active');
        }
    });

    console.log('✅ UserDropdown configurado');
}


// ============================================
// FUNÇÃO PARA ATUALIZAR DADOS DO USUÁRIO
// ============================================

/**
 * Atualiza os dados do usuário na interface
 * Deve ser chamada após o login ou quando os dados mudarem
 */
function updateUserInfo(user) {
    if (!user) {
        console.warn('⚠️ Nenhum usuário fornecido');
        return;
    }

    const userName = user.nome || user.user_metadata?.nome || user.email?.split('@')[0] || 'Usuário';
    const userEmail = user.email || '';
    const initials = userName.charAt(0).toUpperCase();

    // Atualizar elementos
    const nameElements = ['userName', 'dropdownName'];
    nameElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = userName;
    });

    const emailElements = ['dropdownEmail'];
    emailElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = userEmail;
    });

    const avatarElements = ['userAvatar', 'dropdownAvatar'];
    avatarElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = initials;
    });
}


// ============================================
// EXPORTAR (para uso em módulos)
// ============================================

// Se estiver usando ES Modules
export { setupUserDropdown, updateUserInfo };

// Se estiver usando script tradicional, expõe globalmente
if (typeof window !== 'undefined') {
    window.setupUserDropdown = setupUserDropdown;
    window.updateUserInfo = updateUserInfo;
}


// ============================================
// EXEMPLO DE USO
// ============================================

/*
// No HTML:
<header class="app-header">
    <a href="dashboard.html" class="logo">ERENAL<span>DO</span></a>
    <div class="user-info">
        <span class="user-name" id="userName">Carregando...</span>
        <div class="user-avatar" id="userAvatar" role="button" tabindex="0" aria-haspopup="true">
            A
        </div>
        <div class="user-dropdown" id="userDropdown" role="menu">
            <div class="dropdown-header">
                <div class="dropdown-avatar" id="dropdownAvatar">A</div>
                <div class="dropdown-user-info">
                    <span class="dropdown-name" id="dropdownName">Usuário</span>
                    <span class="dropdown-email" id="dropdownEmail">usuario@email.com</span>
                </div>
            </div>
            <div class="dropdown-divider"></div>
            <a href="gestao.html" class="dropdown-item" role="menuitem">
                <i data-lucide="settings"></i>
                Gestão
            </a>
            <button class="dropdown-item logout" id="logoutBtn" role="menuitem">
                <i data-lucide="log-out"></i>
                Sair
            </button>
        </div>
    </div>
</header>

// No JavaScript (após o login):
import { setupUserDropdown, updateUserInfo } from './modules/dropdown.js';

// Após autenticação
const user = await AuthService.getCurrentUser();
if (user) {
    updateUserInfo(user);
    setupUserDropdown(supabase);
}
*/