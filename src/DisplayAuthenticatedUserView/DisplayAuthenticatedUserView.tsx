import { useReactiveClient } from "@dynamic-labs/react-hooks";
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Button,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import nacl_util from "tweetnacl-util";
import { client } from "../client";
import { Wallet } from "@dynamic-labs/client";
import * as WebBrowser from "expo-web-browser";
import { useQuote, Quote } from "../hooks/useQuote";

export const DisplayAuthenticatedUserView: FC = () => {
  const { auth, wallets } = useReactiveClient(client);
  const { data: quoteData, isBusy, error, refetch } = useQuote();
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [isFunded, setIsFunded] = useState(false);
  const address = wallets.userWallets[0].address;

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paymentIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const fetchPaymentStatus = useCallback(async () => {
    if (!paymentIdRef.current) return;
    try {
      const res = await fetch(
        `https://v2.prod.halliday.xyz/payments/${paymentIdRef.current}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.EXPO_PUBLIC_HALLIDAY_API_KEY}`,
          },
        },
      );
      const data = await res.json();
      setPaymentStatus(data.status);
      if (data.funded) {
        setIsFunded(true);
        stopPolling();
        if (Platform.OS === "ios") {
          WebBrowser.dismissBrowser();
        }
      }
    } catch {
      // Ignore polling failures; will retry on next interval
    }
  }, [stopPolling]);

  const startPolling = useCallback(
    (paymentId: string) => {
      stopPolling();
      paymentIdRef.current = paymentId;
      fetchPaymentStatus();
      pollingRef.current = setInterval(fetchPaymentStatus, 3000);
    },
    [fetchPaymentStatus, stopPolling],
  );

  // Check payment status immediately when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && paymentIdRef.current) {
        fetchPaymentStatus();
      }
    });
    return () => {
      sub.remove();
      stopPolling();
    };
  }, [fetchPaymentStatus, stopPolling]);

  const handleConfirmPayment = async () => {
    if (!selectedQuote || !quoteData) return;
    setConfirming(true);
    setConfirmResult(null);
    setConfirmError(null);
    setPaymentStatus(null);
    setIsFunded(false);
    try {
      const response = await fetch(
        "https://v2.prod.halliday.xyz/payments/confirm",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.EXPO_PUBLIC_HALLIDAY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            payment_id: selectedQuote.payment_id,
            state_token: quoteData.state_token,
            owner_address: address,
            destination_address: address,
            client_redirect_url: "https://google.com",
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          JSON.stringify(data, null, 2) || `API error: ${response.status}`,
        );
      }
      setConfirmResult(JSON.stringify(data, null, 2));

      const paymentId = data?.payment_id;
      const fundingUrl = data?.next_instruction?.funding_page_url;
      if (fundingUrl && paymentId) {
        startPolling(paymentId);
        await WebBrowser.openBrowserAsync(fundingUrl);
        // iOS: check status immediately after browser dismissal
        fetchPaymentStatus();
      }
    } catch (e: any) {
      setConfirmError(e.message);
    } finally {
      setConfirming(false);
    }
  };

  const groupedQuotes = useMemo(() => {
    if (!quoteData?.quotes) return {};
    return quoteData.quotes.reduce<Record<string, Quote[]>>((acc, q) => {
      const key = q.onramp.toUpperCase();
      if (!acc[key]) acc[key] = [];
      acc[key].push(q);
      return acc;
    }, {});
  }, [quoteData]);

  const handleSignEVMMessage = async (wallet: Wallet) => {
    const walletClient = await client.viem.createWalletClient({
      wallet,
    });
    await walletClient.signMessage({ message: "gm!" });
  };

  const handleSignSolanaMessage = async (wallet: Wallet) => {
    const message = "gm";
    const messageBytes = nacl_util.decodeUTF8(message);
    const signer = client.solana.getSigner({ wallet });
    await signer.signMessage(messageBytes);
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.section__heading}>User:</Text>
        <View style={styles.content_section}>
          <Text>{JSON.stringify(auth.authenticatedUser, null, 2)}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.section__heading}>Actions</Text>
        <View style={[styles.content_section, styles.actions_section]}>
          <Button
            onPress={() => client.ui.userProfile.show()}
            title="User Profile UI"
          />
          <Button onPress={() => client.auth.logout()} title="Logout" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.section__heading}>Wallets:</Text>
        <View style={styles.content_section}>
          {wallets.userWallets.map((wallet) => (
            <View key={wallet.id} style={styles.wallet_item}>
              <Text>Wallet address: {wallet.address}</Text>
              <Text>Chain: {wallet.chain}</Text>

              {wallet.chain === "EVM" && (
                <Button
                  title="Sign message (EVM)"
                  onPress={() => handleSignEVMMessage(wallet)}
                />
              )}

              {wallet.chain === "SOL" && (
                <View style={styles.button_group}>
                  <Button
                    title="Sign message (Solana)"
                    onPress={() => handleSignSolanaMessage(wallet)}
                  />
                </View>
              )}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.section__heading}>Payment Quotes:</Text>
        <View style={[styles.content_section, styles.actions_section]}>
          <Text style={styles.api_description}>
            USD $100 → stable token quotes
          </Text>
          <Button
            onPress={() => refetch()}
            title="Fetch Quotes"
            disabled={isBusy}
          />
          {isBusy && (
            <View style={styles.skeleton_container}>
              <ActivityIndicator size="large" />
              <Text style={styles.skeleton_text}>Loading quotes...</Text>
            </View>
          )}
          {error && (
            <View style={styles.error_container}>
              <Text style={styles.error_text}>Error: {error.message}</Text>
            </View>
          )}
          {!isBusy &&
            Object.entries(groupedQuotes).map(([onramp, quotes]) => (
              <View key={onramp} style={styles.onramp_group}>
                <Text style={styles.onramp_title}>{onramp}</Text>
                {quotes.map((q: Quote) => {
                  const isSelected =
                    selectedQuote?.payment_id === q.payment_id;
                  return (
                    <Pressable
                      key={q.payment_id}
                      onPress={() =>
                        setSelectedQuote(isSelected ? null : q)
                      }
                    >
                      <View
                        style={[
                          styles.quote_card,
                          isSelected && styles.quote_card_selected,
                        ]}
                      >
                        <View style={styles.quote_header}>
                          <Text style={styles.quote_method}>
                            {q.onramp_method.replace(/_/g, " ")}
                          </Text>
                          <Text style={styles.quote_amount}>
                            {parseFloat(q.output_amount.amount).toFixed(2)}{" "}
                            USDT
                          </Text>
                        </View>
                        <Text style={styles.quote_fees}>
                          Fees: $
                          {parseFloat(q.fees.total_fees).toFixed(2)}{" "}
                          {q.fees.currency_symbol.toUpperCase()}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
        </View>
      </View>

      {selectedQuote && (
        <View style={styles.section}>
          <Text style={styles.section__heading}>Confirm Payment:</Text>
          <View style={[styles.content_section, styles.confirm_section]}>
            <Text style={styles.confirm_detail}>
              {selectedQuote.onramp.toUpperCase()} -{" "}
              {selectedQuote.onramp_method.replace(/_/g, " ")}
            </Text>
            <Text style={styles.confirm_amount}>
              {parseFloat(selectedQuote.output_amount.amount).toFixed(2)} USDT
            </Text>
            <Text style={styles.quote_fees}>
              Fees: ${parseFloat(selectedQuote.fees.total_fees).toFixed(2)}{" "}
              {selectedQuote.fees.currency_symbol.toUpperCase()}
            </Text>
            <Button
              title={confirming ? "Confirming..." : "Confirm Payment"}
              onPress={handleConfirmPayment}
              disabled={confirming}
            />
            {confirming && <ActivityIndicator size="small" />}
            {paymentStatus && (
              <View
                style={[
                  styles.status_badge,
                  isFunded && styles.status_funded,
                ]}
              >
                <Text style={styles.status_text}>
                  Status: {paymentStatus}
                  {isFunded ? " (Funded)" : ""}
                </Text>
              </View>
            )}
            {confirmError && (
              <View style={styles.error_container}>
                <Text style={styles.error_text}>{confirmError}</Text>
              </View>
            )}
            {confirmResult && (
              <View style={styles.confirm_result}>
                <Text style={styles.confirm_result_text}>
                  {confirmResult}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.section__heading}>JWT:</Text>
        <View style={styles.content_section}>
          <Text>{auth.token}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignContent: "stretch",
    gap: 40,
    padding: 20,
  },
  section: {
    gap: 5,
  },
  section__heading: {
    fontSize: 14,
    fontWeight: "bold",
  },
  content_section: {
    padding: 10,
    borderRadius: 6,
    backgroundColor: "#f9f9f9",
  },
  actions_section: {
    flexDirection: "column",
    gap: 6,
  },
  wallet_item: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eaeaea",
  },
  button_group: {
    marginTop: 8,
    gap: 8,
  },
  api_description: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  skeleton_container: {
    alignItems: "center",
    padding: 20,
    gap: 10,
  },
  skeleton_text: {
    fontSize: 12,
    color: "#999",
  },
  error_container: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "#fff0f0",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#ffcccc",
  },
  error_text: {
    color: "#cc0000",
    fontSize: 13,
  },
  onramp_group: {
    marginTop: 12,
    gap: 6,
  },
  onramp_title: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  quote_card: {
    padding: 10,
    backgroundColor: "#fff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#eaeaea",
    gap: 4,
  },
  quote_header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  quote_method: {
    fontSize: 11,
    color: "#666",
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  quote_amount: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a8917",
    marginTop: 4,
  },
  quote_fees: {
    fontSize: 11,
    color: "#999",
  },
  quote_card_selected: {
    borderColor: "#007AFF",
    borderWidth: 2,
    backgroundColor: "#f0f7ff",
  },
  confirm_section: {
    gap: 8,
  },
  confirm_detail: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#333",
  },
  confirm_amount: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a8917",
  },
  confirm_result: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "#f0fff0",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#c0e0c0",
  },
  confirm_result_text: {
    fontSize: 11,
    color: "#333",
    fontFamily: "monospace",
  },
  status_badge: {
    padding: 8,
    borderRadius: 4,
    backgroundColor: "#fff8e1",
    borderWidth: 1,
    borderColor: "#ffcc02",
  },
  status_funded: {
    backgroundColor: "#e8f5e9",
    borderColor: "#4caf50",
  },
  status_text: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
});
