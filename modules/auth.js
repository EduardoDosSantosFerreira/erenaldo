// modules/auth.js
import supabase from '../services/supabase.js';
import { setupUserDropdown, updateUserInfo } from './dropdown.js';

export class AuthService {
    static async login(email, password) {
        try {
            console.log('🔐 Tentando login com:', email);
            
            // 1. Autenticar no Supabase
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password.trim()
            });

            if (authError) {
                console.error('❌ Erro de autenticação:', authError);
                throw new Error(authError.message || 'Email ou senha incorretos');
            }

            if (!authData.user) {
                throw new Error('Usuário não encontrado');
            }

            console.log('✅ Usuário autenticado:', authData.user.id);

            // 2. Buscar ou criar perfil
            let userData = null;

            try {
                const { data, error } = await supabase
                    .from('usuarios')
                    .select('*')
                    .eq('id', authData.user.id)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    throw error;
                }
                userData = data;
            } catch (e) {
                console.log('⚠️ Erro ao buscar perfil:', e);
            }

            // 3. Se não encontrou, criar
            if (!userData) {
                console.log('📝 Criando perfil para:', authData.user.email);
                
                const nome = authData.user.user_metadata?.nome || 
                             authData.user.email.split('@')[0] || 
                             'Usuário';
                
                const perfil = authData.user.user_metadata?.perfil || 'tecnico';

                const { data: newUser, error: createError } = await supabase
                    .from('usuarios')
                    .upsert([{
                        id: authData.user.id,
                        email: authData.user.email,
                        nome: nome,
                        perfil: perfil,
                        status: 'ativo'
                    }], { onConflict: 'id' })
                    .select()
                    .single();

                if (createError) {
                    console.error('❌ Erro ao criar perfil:', createError);
                    throw new Error('Erro ao criar perfil do usuário');
                }

                userData = newUser;
            }

            // 4. Salvar sessão
            const sessionData = {
                user: userData,
                session: authData.session,
                timestamp: Date.now()
            };
            
            localStorage.setItem('erenaldo_user', JSON.stringify(sessionData));

            // 5. Configurar dropdown com os dados do usuário
            if (userData) {
                updateUserInfo(userData);
                // Aguardar o DOM carregar para configurar o dropdown
                if (document.readyState === 'complete' || document.readyState === 'interactive') {
                    setupUserDropdown(supabase);
                } else {
                    document.addEventListener('DOMContentLoaded', () => {
                        setupUserDropdown(supabase);
                    });
                }
            }

            console.log('✅ Login bem-sucedido!', userData.nome);
            return { user: userData, session: authData.session };

        } catch (error) {
            console.error('❌ Erro no login:', error);
            throw error;
        }
    }

    static async logout() {
        try {
            await supabase.auth.signOut();
            localStorage.removeItem('erenaldo_user');
            localStorage.removeItem('supabase.auth.token');
            
            // Redirecionar para login
            window.location.href = '/login.html';
        } catch (error) {
            console.error('❌ Erro no logout:', error);
            throw error;
        }
    }

    static async getCurrentUser() {
        try {
            // Verificar cache primeiro
            const cached = localStorage.getItem('erenaldo_user');
            if (cached) {
                try {
                    const data = JSON.parse(cached);
                    // Cache válido por 24 horas
                    if (data.timestamp && (Date.now() - data.timestamp) < 86400000) {
                        return data.user;
                    }
                } catch (e) {
                    console.warn('⚠️ Erro ao parsear cache:', e);
                }
            }

            // Buscar do Supabase
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                console.warn('⚠️ Usuário não autenticado:', userError?.message);
                return null;
            }

            // Buscar perfil
            const { data: profile, error: profileError } = await supabase
                .from('usuarios')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profileError) {
                console.warn('⚠️ Perfil não encontrado:', profileError.message);
                // Se não encontrou, criar perfil básico
                const nome = user.user_metadata?.nome || user.email?.split('@')[0] || 'Usuário';
                const perfil = user.user_metadata?.perfil || 'tecnico';
                
                const { data: newProfile, error: createError } = await supabase
                    .from('usuarios')
                    .upsert([{
                        id: user.id,
                        email: user.email,
                        nome: nome,
                        perfil: perfil,
                        status: 'ativo'
                    }], { onConflict: 'id' })
                    .select()
                    .single();

                if (createError) {
                    console.error('❌ Erro ao criar perfil:', createError);
                    return null;
                }

                // Salvar no cache
                localStorage.setItem('erenaldo_user', JSON.stringify({
                    user: newProfile,
                    timestamp: Date.now()
                }));

                // Configurar dropdown
                updateUserInfo(newProfile);
                setupUserDropdown(supabase);

                return newProfile;
            }

            // Salvar no cache
            localStorage.setItem('erenaldo_user', JSON.stringify({
                user: profile,
                timestamp: Date.now()
            }));

            // Configurar dropdown com os dados do usuário
            updateUserInfo(profile);
            setupUserDropdown(supabase);

            return profile;
        } catch (error) {
            console.error('❌ Erro ao buscar usuário:', error);
            return null;
        }
    }

    static async checkAuth() {
        try {
            const user = await this.getCurrentUser();
            const currentPath = window.location.pathname;
            const isLoginPage = currentPath.includes('login.html') || 
                               currentPath.includes('register.html');
            const isGestaoPage = currentPath.includes('gestao.html');
            
            // Se não está logado e não está na página de login/registro
            if (!user && !isLoginPage) {
                window.location.href = '/login.html';
                return null;
            }
            
            // Se está logado e está na página de login/registro
            if (user && isLoginPage) {
                window.location.href = '/dashboard.html';
                return null;
            }

            // Se está logado e está na página de gestão, verificar se é admin
            if (user && isGestaoPage && user.perfil !== 'admin') {
                window.showToast('Acesso negado! Apenas administradores.', 'error');
                window.location.href = '/dashboard.html';
                return null;
            }
            
            // Se está logado, configurar dropdown
            if (user) {
                updateUserInfo(user);
                setupUserDropdown(supabase);
            }

            return user;
        } catch (error) {
            console.error('❌ Erro ao verificar autenticação:', error);
            return null;
        }
    }

    // ============================================
    // MÉTODO PARA ATUALIZAR DADOS DO USUÁRIO
    // ============================================
    static async updateUserProfile(updates) {
        try {
            const currentUser = await this.getCurrentUser();
            if (!currentUser) throw new Error('Usuário não autenticado');

            const { data, error } = await supabase
                .from('usuarios')
                .update(updates)
                .eq('id', currentUser.id)
                .select()
                .single();

            if (error) throw error;

            // Atualizar cache
            const cached = localStorage.getItem('erenaldo_user');
            if (cached) {
                const cacheData = JSON.parse(cached);
                cacheData.user = data;
                cacheData.timestamp = Date.now();
                localStorage.setItem('erenaldo_user', JSON.stringify(cacheData));
            }

            // Atualizar interface
            updateUserInfo(data);

            return data;
        } catch (error) {
            console.error('❌ Erro ao atualizar perfil:', error);
            throw error;
        }
    }

    // ============================================
    // MÉTODO PARA VERIFICAR PERMISSÕES
    // ============================================
    static isAdmin() {
        const user = this.getCurrentUserSync();
        return user?.perfil === 'admin';
    }

    static getCurrentUserSync() {
        try {
            const cached = localStorage.getItem('erenaldo_user');
            if (!cached) return null;
            const data = JSON.parse(cached);
            if (data.timestamp && (Date.now() - data.timestamp) < 86400000) {
                return data.user;
            }
            return null;
        } catch {
            return null;
        }
    }
}

// ============================================
// EXPORTAR FUNÇÕES DO DROPDOWN PARA USO GLOBAL
// ============================================

// Se estiver em um ambiente que não suporta módulos, expõe globalmente
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}