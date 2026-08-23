/**
 * O ambiente antes de qualquer import.
 */
process.env.NODE_ENV = 'test';

/**
 * O `.env` da máquina não entra no teste.
 */
for (const chave of [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_ADMIN_ID',
  'PUBLIC_ORIGIN',
]) {
  process.env[chave] = '';
}
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
// Porta 0: o sistema escolhe uma livre, e dois arquivos de teste rodando ao
// mesmo tempo não brigam por ela.
process.env.PORT ??= '0';
