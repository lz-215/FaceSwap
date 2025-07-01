"use client";

import { useTranslations } from "next-intl";

import { useCreditTransactions } from "~/lib/hooks/use-credit-transactions";
import { Button } from "~/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";

interface CreditTransactionsProps {
    className?: string;
}

export function CreditTransactions({
    className = "",
}: CreditTransactionsProps) {
    const t = useTranslations("Payment");
    const { error, hasMore, isLoading, loadMore, transactions } = useCreditTransactions(10);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    const formatAmount = (amount: number) => {
        return amount > 0 ? `+${amount}` : amount.toString();
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case "CONSUMPTION":
                return t("consumption");
            case "RECHARGE":
                return t("recharge");
            case "REWARD":
                return t("reward");
            default:
                return type;
        }
    };

    if (error) {
        return (
            <div className={`
              space-y-4
              ${className}
            `}>
                <h3 className="text-lg font-medium">{t("creditTransactions")}</h3>
                <div className="text-center text-red-500">
                    加载交易记录失败，请稍后重试
                </div>
            </div>
        );
    }

    return (
        <div className={`
          space-y-4
          ${className}
        `}>
            <h3 className="text-lg font-medium">{t("creditTransactions")}</h3>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("date")}</TableHead>
                            <TableHead>{t("type")}</TableHead>
                            <TableHead>{t("description")}</TableHead>
                            <TableHead className="text-right">{t("amount")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactions.length === 0 && !isLoading ? (
                            <TableRow>
                                <TableCell
                                    className={`
                                      h-24 text-center text-muted-foreground
                                    `}
                                    colSpan={4}
                                >
                                    {t("noTransactions")}
                                </TableCell>
                            </TableRow>
                        ) : (
                            transactions.map((transaction) => (
                                <TableRow key={transaction.id}>
                                    <TableCell>
                                        {formatDate(transaction.createdAt)}
                                    </TableCell>
                                    <TableCell>{getTypeLabel(transaction.actionType)}</TableCell>
                                    <TableCell>{transaction.description}</TableCell>
                                    <TableCell
                                        className={`
                                          text-right font-medium
                                          ${transaction.amount > 0 ? `
                                            text-green-600
                                          ` : `text-red-600`}
                                        `}
                                    >
                                        {formatAmount(transaction.amount)}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}

                        {isLoading && (
                            <TableRow>
                                <TableCell
                                    className={`
                                      h-24 text-center text-muted-foreground
                                    `}
                                    colSpan={4}
                                >
                                    <div className={`
                                      flex h-full items-center justify-center
                                    `}>
                                        <div className={`
                                          h-6 w-6 animate-spin rounded-full
                                          border-b-2 border-primary
                                        `} />
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {hasMore && !isLoading && transactions.length > 0 && (
                <div className="mt-4 flex justify-center">
                    <Button onClick={loadMore} variant="outline">
                        {t("loadMore")}
                    </Button>
                </div>
            )}
        </div>
    );
}
