"use client";

import { useTranslations } from "next-intl";
import { useCredits } from "~/lib/hooks/useCredits";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { ScrollArea } from "~/components/ui/scroll-area";

export function CreditTransactions() {
  const t = useTranslations("Credits");
  const { transactions, isLoading } = useCredits();

  if (isLoading) {
    return <div>{t("loading")}</div>;
  }

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4">{t("transactionHistory")}</h3>
      <ScrollArea className="h-[300px] rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("description")}</TableHead>
              <TableHead className="text-right">{t("amount")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell>
                  {new Date(tx.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>{tx.description}</TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={
                      tx.amount > 0 ? "default" : "destructive"
                    }
                  >
                    {tx.amount}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}