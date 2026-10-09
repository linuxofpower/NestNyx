export type NyxIniDepth = 'basic' | 'normal' | 'deep';
export type NyxIniScope = 'local' | 'global';

export function parseNyxIniModifiers(value: string): { scope: NyxIniScope; depth: NyxIniDepth } {
  const marker = value.trim();
  if (!/^(?:o[GN]{2}|[GN]{2}o)$/.test(marker)) {
    throw new Error('INVALID_INI_MODIFIERS');
  }
  const letters = marker.replace('o', '');
  if (letters !== 'GN' && letters !== 'NG') {
    throw new Error('INVALID_INI_MODIFIERS');
  }
  return { scope: 'global', depth: 'normal' };
}

export function resolveNyxIniInput(input: {
  target?: string;
  modifiers?: string;
  scope?: NyxIniScope;
  depth?: NyxIniDepth;
}) {
  const raw = input.target?.trim();
  const tokens = raw?.split(/\s+/) ?? [];
  const inline = tokens.length === 2 ? tokens[1] : undefined;
  if (tokens.length > 2 || (inline && input.modifiers)) throw new Error('INVALID_INI_ARGUMENTS');
  const modifiers = input.modifiers ?? inline;
  const parsed = modifiers ? parseNyxIniModifiers(modifiers) : undefined;
  const target = tokens[0] || undefined;
  const scope = input.scope ?? parsed?.scope;
  if (target && !scope) throw new Error('SCOPE_REQUIRED');
  if (parsed && input.scope && input.scope !== parsed.scope) throw new Error('SCOPE_CONFLICT');
  if (parsed && input.depth && input.depth !== parsed.depth) throw new Error('DEPTH_CONFLICT');
  return { target, scope, depth: input.depth ?? parsed?.depth ?? 'basic' };
}
