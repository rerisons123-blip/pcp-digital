import { supabase } from './supabase-client.js';

/** Estado de sessão em memória — recarregado a cada boot via getSession(). */
let currentUser = null;
let currentRole = null;

export async function initAuth() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    await loadUserAndRole(data.session.user);
  }
  return currentUser;
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(traduzErroLogin(error));
  await loadUserAndRole(data.user);
  return currentUser;
}

export async function logout() {
  await supabase.auth.signOut();
  currentUser = null;
  currentRole = null;
}

export function getCurrentUser() {
  return currentUser;
}

export function getCurrentRole() {
  return currentRole; // 'coletor' | 'analista' | null
}

export function isAnalista() {
  return currentRole === 'analista';
}

async function loadUserAndRole(user) {
  currentUser = user;
  const { data, error } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  // Se o profile ainda não existiu (trigger não rodou / corrida rara), assume o papel
  // mais restrito por padrão em vez de travar o app.
  currentRole = error ? 'coletor' : data.role;
}

function traduzErroLogin(error) {
  if (error.message?.includes('Invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  return 'Não foi possível entrar. Verifique sua conexão e tente novamente.';
}
