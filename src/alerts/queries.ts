import { Alert, Subsidiary } from "@prisma/client";
import { prisma } from "../data/prisma";

export async function listOpenAlerts(subsidiary?: Subsidiary): Promise<Alert[]> {
  if (subsidiary) {
    return prisma.$queryRaw<Alert[]>`
      select *
      from alerts
      where status = 'open'
        and subsidiary = ${subsidiary}::"Subsidiary"
      order by
        case priority
          when 'high' then 1
          when 'medium' then 2
          when 'low' then 3
        end,
        created_at asc
    `;
  }

  return prisma.$queryRaw<Alert[]>`
    select *
    from alerts
    where status = 'open'
    order by
      case priority
        when 'high' then 1
        when 'medium' then 2
        when 'low' then 3
      end,
      created_at asc
  `;
}
