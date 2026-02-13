import { useQuery } from "@tanstack/react-query";

export interface QuoteFees {
  total_fees: string;
  conversion_fees: string;
  network_fees: string;
  business_fees: string;
  currency_symbol: string;
}

export interface Quote {
  payment_id: string;
  onramp: string;
  onramp_method: string;
  output_amount: {
    asset: string;
    amount: string;
  };
  fees: QuoteFees;
}

export interface QuoteResponse {
  quotes: Quote[];
  current_prices: Record<string, string>;
  price_currency: string;
  state_token: string;
  quoted_at: string;
  accept_by: string;
}

export interface UseQuoteReturn {
  data: QuoteResponse | null;
  isBusy: boolean;
  error: Error | null;
  refetch: () => void;
}

const API_KEY = process.env.EXPO_PUBLIC_HALLIDAY_API_KEY;

export const useQuote = (): UseQuoteReturn => {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<QuoteResponse>({
    queryKey: ["quote"],
    queryFn: async () => {
      const response = await fetch(
        "https://v2.prod.halliday.xyz/payments/quotes",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            request: {
              kind: "FIXED_INPUT",
              fixed_input_amount: {
                asset: "USD",
                amount: "100",
              },
              output_asset:
                "stable:0x779ded0c9e1022225f8e0630b35a9b54be713736",
            },
            price_currency: "USD",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return response.json();
    },
    enabled: !!API_KEY,
  });

  return {
    data: data ?? null,
    isBusy: isLoading,
    error: error as Error | null,
    refetch,
  };
};
