import { describe, expect, it } from 'vitest';
import {
  DISCORD_INSTALL_URL,
  DISCORD_USER_INSTALL_URL,
  DISCORD_GUILD_INSTALL_URL,
} from '../constants/discord';

describe('Discord installation URL constants', () => {
  it('DISCORD_USER_INSTALL_URL includes integration_type=1 for Discord App installation', () => {
    expect(DISCORD_USER_INSTALL_URL).toContain('integration_type=1');
    expect(DISCORD_USER_INSTALL_URL).toContain('scope=applications.commands+identify');
  });

  it('DISCORD_GUILD_INSTALL_URL includes integration_type=0 for server installation', () => {
    expect(DISCORD_GUILD_INSTALL_URL).toContain('integration_type=0');
    expect(DISCORD_GUILD_INSTALL_URL).toContain('scope=applications.commands+identify');
  });

  it('DISCORD_INSTALL_URL defaults to User App installation (DISCORD_USER_INSTALL_URL)', () => {
    expect(DISCORD_INSTALL_URL).toBe(DISCORD_USER_INSTALL_URL);
  });
});
