export const DISCORD_CLIENT_ID = '1540065649181724722';

export const DISCORD_USER_INSTALL_URL = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&integration_type=1&scope=applications.commands+identify`;
export const DISCORD_GUILD_INSTALL_URL = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&integration_type=0&scope=applications.commands+identify`;

export const DISCORD_INSTALL_URL = DISCORD_USER_INSTALL_URL;
