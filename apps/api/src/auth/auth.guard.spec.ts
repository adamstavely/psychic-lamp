import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import type { TokenVerifier } from './token-verifier.js';

function contextFor(headers: Record<string, string>, isPublic = false) {
  const req: { headers: Record<string, string>; claims?: unknown } = { headers };
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(isPublic) } as unknown as Reflector;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { req, reflector, context };
}

describe('AuthGuard', () => {
  const verifier = { verify: vi.fn() } satisfies TokenVerifier;

  beforeEach(() => {
    verifier.verify.mockReset();
  });

  it('lets public routes through without a token', async () => {
    const { reflector, context } = contextFor({}, true);
    await expect(new AuthGuard(reflector, verifier).canActivate(context)).resolves.toBe(true);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('rejects a request with no bearer token', async () => {
    const { reflector, context } = contextFor({});
    await expect(new AuthGuard(reflector, verifier).canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token the verifier refuses', async () => {
    verifier.verify.mockImplementation(async () => {
      throw new Error('expired');
    });
    const { reflector, context } = contextFor({ authorization: 'Bearer abc' });
    await expect(new AuthGuard(reflector, verifier).canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('puts the claims of a valid token on the request', async () => {
    verifier.verify.mockResolvedValue({ sub: 'u-1', name: 'Alex Morgan' });
    const { req, reflector, context } = contextFor({ authorization: 'Bearer abc' });
    await expect(new AuthGuard(reflector, verifier).canActivate(context)).resolves.toBe(true);
    expect(req.claims).toEqual({ sub: 'u-1', name: 'Alex Morgan' });
  });
});
