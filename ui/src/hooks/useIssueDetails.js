import React from 'react';

const ISSUE_ENDPOINT = '/api/repos/issue';

function normaliseIssuePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Issue details missing from response');
  }
  const issue = payload.issue;
  if (!issue || typeof issue !== 'object') {
    throw new Error('Issue details missing from response');
  }
  const fetchedAt =
    typeof payload.fetchedAt === 'string' && payload.fetchedAt ? payload.fetchedAt : null;
  return {
    issue,
    fetchedAt,
  };
}

export function buildIssueCacheKey(repository, issueNumber) {
  if (!repository || typeof repository !== 'object') {
    return null;
  }
  const { org, repo } = repository;
  if (!org || !repo || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    return null;
  }
  return `${org}/${repo}#${issueNumber}`;
}

export function useIssueDetails({
  repository,
  issueNumber,
  cacheRef,
  inFlightRef,
  refreshToken = 0,
} = {}) {
  const fallbackCacheRef = React.useRef(null);
  if (!fallbackCacheRef.current) {
    fallbackCacheRef.current = new Map();
  }
  const fallbackInFlightRef = React.useRef(null);
  if (!fallbackInFlightRef.current) {
    fallbackInFlightRef.current = new Map();
  }

  const cacheStore = cacheRef?.current ?? fallbackCacheRef.current;
  const inFlightStore = inFlightRef?.current ?? fallbackInFlightRef.current;

  const repositoryKey = React.useMemo(() => {
    if (!repository || typeof repository !== 'object') {
      return '';
    }
    const org = typeof repository.org === 'string' ? repository.org : '';
    const repo = typeof repository.repo === 'string' ? repository.repo : '';
    if (!org || !repo) {
      return '';
    }
    return `${org}/${repo}`;
  }, [repository]);

  const [state, setState] = React.useState(() => ({
    status: 'idle',
    data: null,
    error: null,
  }));

  React.useEffect(() => {
    if (!repositoryKey || !Number.isInteger(issueNumber) || issueNumber <= 0) {
      setState({ status: 'idle', data: null, error: null });
      return;
    }

    const cacheKey = `${repositoryKey}#${issueNumber}`;

    if (cacheStore.has(cacheKey)) {
      setState({ status: 'success', data: cacheStore.get(cacheKey), error: null });
      return;
    }

    let cancelled = false;

    const handleResolved = (result) => {
      if (cancelled) {
        return;
      }
      cacheStore.set(cacheKey, result);
      setState({ status: 'success', data: result, error: null });
    };

    const handleRejected = (error) => {
      if (cancelled) {
        return;
      }
      if (error?.name === 'AbortError') {
        return;
      }
      const message =
        typeof error?.message === 'string' && error.message
          ? error.message
          : 'Failed to load issue details';
      setState({ status: 'error', data: null, error: message });
    };

    const existingPromise = inFlightStore.get(cacheKey);
    if (existingPromise) {
      setState({ status: 'loading', data: null, error: null });
      existingPromise.then(handleResolved, handleRejected);
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();
    const baseUrl =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    const url = new URL(ISSUE_ENDPOINT, baseUrl);
    url.searchParams.set('org', repository.org);
    url.searchParams.set('repo', repository.repo);
    url.searchParams.set('issue', String(issueNumber));

    const requestPromise = fetch(url.toString(), {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          let message = `Unable to load issue #${issueNumber}`;
          try {
            const errorPayload = await response.json();
            if (errorPayload?.error) {
              message = errorPayload.error;
            }
          } catch {
            // ignore JSON parse errors from unsuccessful responses
          }
          throw new Error(message);
        }
        return response.json();
      })
      .then((json) => {
        const result = normaliseIssuePayload(json?.data);
        if (!result.fetchedAt) {
          result.fetchedAt = new Date().toISOString();
        }
        cacheStore.set(cacheKey, result);
        return result;
      })
      .finally(() => {
        inFlightStore.delete(cacheKey);
      });

    inFlightStore.set(cacheKey, requestPromise);
    setState({ status: 'loading', data: null, error: null });
    requestPromise.then(handleResolved, handleRejected);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [repositoryKey, issueNumber, cacheStore, inFlightStore, repository, refreshToken]);

  return state;
}
