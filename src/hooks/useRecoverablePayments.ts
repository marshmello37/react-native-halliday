import { useCallback, useState } from "react";

const API_KEY = process.env.EXPO_PUBLIC_HALLIDAY_API_KEY;
const BASE_URL = "https://v2.prod.halliday.xyz";
const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

export interface RecoverablePayment {
  paymentId: string;
  createdAt: string;
  status: string;
  token: string;
  amount: string;
  outputAsset: string;
}

async function apiFetch(
  path: string,
  options?: { method?: string; body?: string },
) {
  const res = await fetch(`${BASE_URL}${path}`, { headers, ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export function useRecoverablePayments() {
  const [payments, setPayments] = useState<RecoverablePayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPayments = useCallback(async (ownerAddress: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        category: "ALL",
        owner_address: ownerAddress,
      });
      const history = await apiFetch(`/payments/history?${params}`);
      const recoverable: RecoverablePayment[] = [];

      for (const payment of history.payment_statuses) {
        if (payment.status === "COMPLETE") continue;
        try {
          const balances = await apiFetch("/payments/balances", {
            method: "POST",
            body: JSON.stringify({ payment_id: payment.payment_id }),
          });
          for (const balance of balances.balance_results) {
            if (+balance.value.amount === 0) continue;
            recoverable.push({
              paymentId: payment.payment_id,
              createdAt: payment.created_at,
              status: payment.status,
              token: balance.token,
              amount: balance.value.amount,
              outputAsset: payment.quoted.output_amount.asset,
            });
          }
        } catch {
          // Skip payments where balance check fails
        }
      }

      setPayments(recoverable);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const getWithdrawTypedData = useCallback(
    (
      paymentId: string,
      token: string,
      amount: string,
      recipientAddress: string,
    ) =>
      apiFetch("/payments/withdraw", {
        method: "POST",
        body: JSON.stringify({
          payment_id: paymentId,
          token_amounts: [{ token, amount }],
          recipient_address: recipientAddress,
        }),
      }),
    [],
  );

  const submitWithdraw = useCallback(
    async (
      paymentId: string,
      token: string,
      amount: string,
      recipientAddress: string,
      signature: string,
    ) => {
      const data = await apiFetch("/payments/withdraw/confirm", {
        method: "POST",
        body: JSON.stringify({
          payment_id: paymentId,
          token_amounts: [{ token, amount }],
          recipient_address: recipientAddress,
          owner_signature: signature,
        }),
      });
      return data.transaction_hash as string;
    },
    [],
  );

  const fetchRetryQuotes = useCallback(
    (
      parentPaymentId: string,
      token: string,
      amount: string,
      outputAsset: string,
    ) =>
      apiFetch("/payments/quotes", {
        method: "POST",
        body: JSON.stringify({
          request: {
            kind: "FIXED_INPUT",
            fixed_input_amount: { asset: token, amount },
            output_asset: outputAsset,
          },
          price_currency: "USD",
          parent_payment_id: parentPaymentId,
        }),
      }),
    [],
  );

  const confirmRetryPayment = useCallback(
    (paymentId: string, stateToken: string, ownerAddress: string) =>
      apiFetch("/payments/confirm", {
        method: "POST",
        body: JSON.stringify({
          payment_id: paymentId,
          state_token: stateToken,
          owner_address: ownerAddress,
          destination_address: ownerAddress,
        }),
      }),
    [],
  );

  const fetchPaymentStatus = useCallback(
    (paymentId: string) => apiFetch(`/payments/${paymentId}`),
    [],
  );

  return {
    payments,
    loading,
    error,
    loadPayments,
    getWithdrawTypedData,
    submitWithdraw,
    fetchRetryQuotes,
    confirmRetryPayment,
    fetchPaymentStatus,
  };
}