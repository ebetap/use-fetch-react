import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const useFetch = (initialUrl, initialOptions = {}) => {
  const {
    method = 'GET',
    headers = {},
    body = null,
    timeout = 10000,
    transformData = data => data,
    retries = 0,
    retryDelay = 1000,
    cache = false,
    pollInterval = null,
    batchSize = 1,
    onPageChange = null,
    onBatchedResponse = null,
    onAuthenticationError = null,
  } = initialOptions;

  const [url, setUrl] = useState(initialUrl);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1); // State for pagination

  const cacheRef = useRef({});
  const cancelRequestRef = useRef(null);
  const batchedRequestsRef = useRef([]);

  const fetchData = useCallback(
    async (abortController, retryCount = 0) => {
      setLoading(true);
      setError(null);

      if (cache && cacheRef.current[url]) {
        setData(cacheRef.current[url]);
        setLoading(false);
        return;
      }

      try {
        const response = await axios({
          url,
          method,
          headers,
          data: body,
          timeout,
          signal: abortController.signal,
        });

        const transformedData = transformData(response.data);

        if (batchSize === 1) {
          setData(transformedData);

          if (cache) {
            cacheRef.current[url] = transformedData;
          }
        } else {
          batchedRequestsRef.current.push(transformedData);

          if (batchedRequestsRef.current.length >= batchSize) {
            const batchedResponse = onBatchedResponse ? onBatchedResponse(batchedRequestsRef.current) : batchedRequestsRef.current;
            setData(batchedResponse);

            batchedRequestsRef.current = [];
          }
        }

        setError(null);
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 401 && onAuthenticationError) {
            onAuthenticationError();
          }

          if (retryCount < retries) {
            setTimeout(() => fetchData(abortController, retryCount + 1), retryDelay * (retryCount + 1));
          } else if (!abortController.signal.aborted) {
            setError({
              message: error.response?.data || 'An unknown error occurred',
              status: error.response?.status,
              type: error.code,
            });
          }
        } else {
          setError({
            message: error.message,
            type: 'general',
          });
        }
      } finally {
        if (retryCount === 0) {
          setLoading(false);
        }
      }
    },
    [url, method, headers, body, timeout, transformData, retries, retryDelay, cache, batchSize, onBatchedResponse, onAuthenticationError]
  );

  useEffect(() => {
    if (cancelRequestRef.current) {
      cancelRequestRef.current.cancel();
    }
    cancelRequestRef.current = axios.CancelToken.source();

    const abortController = new AbortController();
    fetchData(abortController);

    const intervalId = pollInterval ? setInterval(() => fetchData(abortController), pollInterval) : null;

    return () => {
      abortController.abort();
      if (cancelRequestRef.current) {
        cancelRequestRef.current.cancel();
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [fetchData, url, pollInterval]);

  const fetchPage = useCallback((pageNumber) => {
    const nextPageUrl = `${url}?page=${pageNumber}`;
    setUrl(nextPageUrl);
    setPage(pageNumber); // Update local page state

    if (onPageChange) {
      onPageChange(pageNumber);
    }
  }, [url, setUrl, setPage, onPageChange]);

  const fetchMore = useCallback(() => {
    const nextPageNumber = page + 1;
    fetchPage(nextPageNumber);
  }, [page, fetchPage]);

  return {
    data,
    loading,
    error,
    fetchMore,
    fetchPage,
  };
};

export default useFetch;
