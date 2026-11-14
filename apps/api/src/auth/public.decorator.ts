import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'donovan:public';

/** Lets a route answer without a signed-in user. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
