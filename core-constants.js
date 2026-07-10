// ====================================================================
//  CORE — CONSTANTES (extraído do app.js na Fase A da modularização)
// ====================================================================
const SUPABASE_URL      = 'https://xbudnftutemakjbgxayf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhidWRuZnR1dGVtYWtqYmd4YXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NDI1OTMsImV4cCI6MjA5ODMxODU5M30.wJekXdH7z9qcIoF4WsvWST8ro9VsskLGQgcivNx6fYo';

const WHATSAPP_NUMBER   = '953980750';
const IA_EDGE_URL = SUPABASE_URL + '/functions/v1/ia-query';

const STORE_TO_TABLE = {
  clientes:      'clientes',
  agendamentos:  'agendamentos',
  movimentos:    'movimentos',
  profissionais: 'profissionais',
  servicos:      'servicos',
  config:        null,
};

const SYNC_QUEUE_KEY = 'bp_sync_queue';

const PLANOS = {
  trial: { label: 'Plano Gratuito', badgeClass: 'plano-trial', agendamentos: 60, clientes: 30, profissionais: 1,
    iaDia: 0 },
  starter: { label: 'Starter', badgeClass: 'plano-starter', agendamentos: 200, clientes: 150, profissionais: 2,
    iaDia: 0 },
  pro: { label: 'Pro', badgeClass: 'plano-pro', agendamentos: Infinity, clientes: Infinity, profissionais: 8,
    iaDia: 5 },
  premium: { label: 'Premium', badgeClass: 'plano-premium', agendamentos: Infinity, clientes: Infinity,
    profissionais: Infinity, iaDia: Infinity }
};

const PROF_DEFAULT = [
  { id: '34787d59-2187-4953-978c-16cd85813f22', nome: 'Ana', especialidade: 'Coloração' },
  { id: '33ea5d65-c6ba-4be0-a5e0-037052eb1950', nome: 'Carlos', especialidade: 'Corte' },
  { id: '61ec734c-1177-465a-8613-437c4ad5c9b2', nome: 'Marta', especialidade: 'Manicure / Pedicure' },
];

const SERVICOS_DEFAULT = [
  { id: '5334ca54-26e8-43ce-a606-59a424522517', nome: 'Corte de Cabelo', precoBase: 3000, profissionais: ['Ana', 'Carlos'] },
  { id: '1c07da53-9b30-4e6e-b007-b2bc654183ce', nome: 'Coloração', precoBase: 8000, profissionais: ['Ana'] },
  { id: '10497abb-032a-491f-ad1c-ae3d654b37b1', nome: 'Manicure', precoBase: 2000, profissionais: ['Marta'] },
  { id: '4aea339f-bc33-4cfa-8fa8-2243de16b4c3', nome: 'Pedicure', precoBase: 2500, profissionais: ['Marta'] },
  { id: 'a831b14c-f915-46e0-b7a6-f6eea4d8e2bc', nome: 'Maquilhagem', precoBase: 5000, profissionais: ['Ana'] },
  { id: '700ca860-bcf9-4b33-823d-15b92ef132f0', nome: 'Barba', precoBase: 1500, profissionais: ['Carlos'] },
  { id: '7547642b-eeaf-4110-b046-da80b30bf0ba', nome: 'Penteado', precoBase: 4000, profissionais: ['Ana', 'Marta'] },
  { id: '1a81fd9a-8778-44a5-bd3e-11b3a261e1ce', nome: 'Tratamento Capilar', precoBase: 6000, profissionais: ['Ana', 'Carlos'] },
];

const RBAC_ROLES = ['admin', 'gerente', 'operador'];
