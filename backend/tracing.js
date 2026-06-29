import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace } from '@opentelemetry/api';

const serviceName = process.env.OTEL_SERVICE_NAME || 'chat-backend';
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
  });

  sdk.start();

  process.on('SIGTERM', () => sdk.shutdown().catch(console.error));
  process.on('SIGINT', () => sdk.shutdown().catch(console.error));
}

export const tracer = trace.getTracer(serviceName);
