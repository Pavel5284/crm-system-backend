import { Exclude } from 'class-transformer';
import { Role } from '@prisma/client';

export class UserEntity {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;

  @Exclude()
  passwordHash: string;

  @Exclude()
  refreshTokenHash: string | null;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
