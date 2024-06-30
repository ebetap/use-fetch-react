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
  } = initialOptions;

  const [url, setUrl] = useState(initialUrl);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cacheRef = useRef({});
  const cancelRequestRef = useRef(null);
  const [page, setPage] = useState(1); // State for pagination

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
        setData(transformedData);

        if (cache) {
          cacheRef.current[url] = transformedData;
        }

        setError(null);
      } catch (error) {
        if (axios.isAxiosError(error)) {
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
    [url, method, headers, body, timeout, transformData, retries, retryDelay, cache]
  );

  useEffect(() => {
    if (cancelRequestRef.current) {
      cancelRequestRef.current.cancel();
    }
    cancelRequestRef.current = axios.CancelToken.source();

    const abortController = new AbortController();
    fetchData(abortController);

    return () => {
      abortController.abort();
      if (cancelRequestRef.current) {
        cancelRequestRef.current.cancel();
      }
    };
  }, [fetchData, url]);

  const fetchMore = useCallback(() => {
    const nextPageUrl = `${url}?page=${page + 1}`;
    setUrl(nextPageUrl);
    setPage(page + 1); // Update local page state
  }, [url, page, setUrl, setPage]);

  return {
    data,
    loading,
    error,
    fetchMore,
  };
};

export default useFetch;
