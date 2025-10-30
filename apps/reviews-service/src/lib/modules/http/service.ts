import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosRequestHeaders } from 'axios';
import { injectTraceContext } from '@daap/telemetry';

import { IHttpService } from './adapter';

@Injectable()
export class HttpService implements IHttpService {
  instance(config?: AxiosRequestConfig): AxiosInstance {
    const instance = axios.create({ timeout: 60000, ...config });

    // Interceptor: injeta trace context em todas as requisições
    instance.interceptors.request.use((requestConfig) => {
      const tracedHeaders = injectTraceContext(requestConfig.headers as Record<string, string> || {});

      // Try to create an AxiosHeaders instance and merge traced headers into it so the assigned value
      // matches the AxiosRequestHeaders type; if that's not available, fall back to a safe cast.
      const existing = requestConfig.headers as Record<string, any> | undefined;

      try {
        // axios.AxiosHeaders.from will produce an AxiosHeaders instance with proper methods
        const axiosHeaders = (axios as any).AxiosHeaders?.from(existing || {}) as any;
        if (axiosHeaders && typeof axiosHeaders.set === 'function') {
          Object.entries(tracedHeaders).forEach(([k, v]) => {
            axiosHeaders.set(k, v as any);
          });
          requestConfig.headers = axiosHeaders;
        } else {
          // fallback: merge into a plain object and force the type to AxiosRequestHeaders
          requestConfig.headers = { ...(existing || {}), ...tracedHeaders } as unknown as AxiosRequestHeaders;
        }
      } catch {
        // if anything goes wrong, use the fallback cast
        requestConfig.headers = { ...(existing || {}), ...tracedHeaders } as unknown as AxiosRequestHeaders;
      }

      return requestConfig;
    });

    return instance;
  }
}
