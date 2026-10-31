# Neon

|              |                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Organization | `org-fancy-poetry-28977210` (Free plan, public zone; GLK's Scale organization is separate)           |
| Project      | `hockey-standings`, `divine-salad-11934800`                                                          |
| Region       | `aws-us-east-2` (Ohio): Neon has no Canadian region, and Ohio is the closest to Azure Canada Central |
| Postgres     | 17, matching GLK                                                                                     |
| Compute      | 0.25 CU, suspends when idle                                                                          |
| Database     | `hockey`, owned by `hockey_owner`                                                                    |

## Roles

| Role           | Login      | Can                            | Used by                    |
| -------------- | ---------- | ------------------------------ | -------------------------- |
| `hockey_owner` | yes        | everything; owns the tables    | migrations, run by hand    |
| `hockey_write` | no (group) | select, insert, update, delete | the collector's login role |
| `hockey_read`  | no (group) | select                         | the web app's login role   |

`hockey_owner` is Neon's default role, so it is in `neon_superuser`. The two groups are made in SQL ([roles.sql](roles.sql)) so they are not. The login roles (`hockey_collector`, `hockey_web`) are created at deploy time, with passwords that go straight into Key Vault.

To apply or re-apply the roles:

```bash
DATABASE_URL="$(neon connection-string --project-id divine-salad-11934800 \
  --role-name hockey_owner --database-name hockey --ssl verify-full)" \
  node infra/neon/apply.mjs infra/neon/roles.sql
```
