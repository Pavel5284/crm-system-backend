import { Exclude } from 'class-transformer';
import { Role } from '@prisma/client';

export class UserEntity {
  id: string;
  email: string;
  name: string;
  role: Role;
  isEmailVerified: boolean;
  createdAt: Date;

  @Exclude()
  passwordHash: string;

  @Exclude()
  refreshTokenHash: string | null;

  @Exclude()
  emailVerificationToken: string | null;

  @Exclude()
  emailVerificationTokenExpires: Date | null;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
