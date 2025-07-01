declare namespace JSX {
  interface IntrinsicElements {
    'stripe-pricing-table': {
      'pricing-table-id': string;
      'publishable-key': string;
      'customer-email'?: string;
      'client-reference-id'?: string;
      'customer-session-client-secret'?: string;
    };
  }
}

// Stripe Pricing Table 全局声明
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'stripe-pricing-table': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'pricing-table-id': string;
          'publishable-key': string;
          'customer-email'?: string;
          'client-reference-id'?: string;
          'customer-session-client-secret'?: string;
        },
        HTMLElement
      >;
    }
  }
}

export {}; 