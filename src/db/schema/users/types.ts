import type { userTable, sessionTable, accountTable, verificationTable, twoFactorTable } from "./tables";

export type User = typeof userTable.$inferSelect;
export type NewUser = typeof userTable.$inferInsert;

export type Session = typeof sessionTable.$inferSelect;
export type NewSession = typeof sessionTable.$inferInsert;

export type Account = typeof accountTable.$inferSelect;
export type NewAccount = typeof accountTable.$inferInsert;

export type Verification = typeof verificationTable.$inferSelect;
export type NewVerification = typeof verificationTable.$inferInsert;

export type TwoFactor = typeof twoFactorTable.$inferSelect;
export type NewTwoFactor = typeof twoFactorTable.$inferInsert; 