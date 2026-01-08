import { ExecutionContext } from '../runtime/ExecutionContext';

/**
 * Telemetry event properties
 */
export interface TelemetryEventProperties {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Telemetry span
 */
export interface TelemetrySpan {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  properties?: TelemetryEventProperties;
}

/**
 * Telemetry service for events and spans
 * Ensures no PII in logs/artifacts
 */
export class TelemetryService {
  private spans: Map<string, TelemetrySpan> = new Map();

  /**
   * Track an event
   */
  trackEvent(
    ctx: ExecutionContext,
    name: string,
    properties?: TelemetryEventProperties
  ): void {
    if (!ctx.settings.enableTelemetry) {
      return;
    }

    // Filter PII (basic implementation)
    const safeProperties = this.sanitizeProperties(properties);

    ctx.trace('service', 'telemetry-event', {
      name,
      properties: safeProperties,
    });

    // TODO: Send to actual telemetry backend
    if (ctx.settings.verbose) {
      console.log(`[Telemetry] Event: ${name}`, safeProperties);
    }
  }

  /**
   * Start a telemetry span
   */
  startSpan(
    ctx: ExecutionContext,
    name: string,
    properties?: TelemetryEventProperties
  ): string {
    if (!ctx.settings.enableTelemetry) {
      return '';
    }

    const spanId = `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const span: TelemetrySpan = {
      id: spanId,
      name,
      startTime: Date.now(),
      properties: this.sanitizeProperties(properties),
    };

    this.spans.set(spanId, span);

    ctx.trace('service', 'telemetry-span-start', {
      spanId,
      name,
      properties: span.properties,
    });

    return spanId;
  }

  /**
   * End a telemetry span
   */
  endSpan(
    ctx: ExecutionContext,
    spanId: string,
    properties?: TelemetryEventProperties
  ): void {
    if (!ctx.settings.enableTelemetry || !spanId) {
      return;
    }

    const span = this.spans.get(spanId);
    if (!span) {
      return;
    }

    span.endTime = Date.now();
    const duration = span.endTime - span.startTime;

    const safeProperties = this.sanitizeProperties(properties);

    ctx.trace('service', 'telemetry-span-end', {
      spanId,
      name: span.name,
      duration,
      properties: safeProperties,
    });

    // TODO: Send to actual telemetry backend
    if (ctx.settings.verbose) {
      console.log(
        `[Telemetry] Span: ${span.name} (${duration}ms)`,
        { ...span.properties, ...safeProperties }
      );
    }

    this.spans.delete(spanId);
  }

  /**
   * Sanitize properties to remove PII
   */
  private sanitizeProperties(
    properties?: TelemetryEventProperties
  ): TelemetryEventProperties {
    if (!properties) {
      return {};
    }

    const safe: TelemetryEventProperties = {};

    // List of keys that might contain PII
    const piiKeys = new Set([
      'email',
      'username',
      'name',
      'path',
      'filePath',
      'url',
      'uri',
    ]);

    for (const [key, value] of Object.entries(properties)) {
      if (piiKeys.has(key.toLowerCase())) {
        // Hash or redact PII
        safe[key] = '[REDACTED]';
      } else {
        safe[key] = value;
      }
    }

    return safe;
  }
}
