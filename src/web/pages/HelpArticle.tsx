import React, { useCallback, useMemo, useState } from 'react';
import { Spinner } from '@shopify/polaris';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { HelpArticle as HelpArticleType, HelpCategoryInfo } from './HelpCenter';
import { categorySlug } from './HelpCenter';

/* ── Simple markdown-ish renderer ───────────────────────── */
function renderArticleContent(text: string): React.ReactNode {
  if (!text) return null;

  // Split into paragraphs by double-newline
  const blocks = text.split(/\n\n+/);

  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    // Check if the block is a numbered list (lines starting with digits)
    const lines = trimmed.split('\n');
    const isNumberedList = lines.every(
      (l) => /^\d+\.\s/.test(l.trim()) || l.trim() === '',
    );
    const isBulletList = lines.every(
      (l) => /^[-•]\s/.test(l.trim()) || l.trim() === '',
    );

    if (isNumberedList) {
      return (
        <ol key={i}>
          {lines
            .filter((l) => l.trim())
            .map((l, j) => (
              <li key={j}>{renderInline(l.replace(/^\d+\.\s*/, ''))}</li>
            ))}
        </ol>
      );
    }

    if (isBulletList) {
      return (
        <ul key={i}>
          {lines
            .filter((l) => l.trim())
            .map((l, j) => (
              <li key={j}>{renderInline(l.replace(/^[-•]\s*/, ''))}</li>
            ))}
        </ul>
      );
    }

    // Regular paragraph
    return <p key={i}>{renderInline(trimmed)}</p>;
  });
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold** markers
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/* ═══════════════════════════════════════════════════════════
   HelpArticlePage
   ═══════════════════════════════════════════════════════════ */
interface OutletCtx {
  articles: HelpArticleType[];
  categories: { name: string; items: HelpArticleType[] }[];
}

const HelpArticlePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ctx = useOutletContext<OutletCtx>();
  const articles = ctx?.articles || [];
  const categories = ctx?.categories || [];

  const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null);

  const article = useMemo(
    () => articles.find((a) => a.id === Number(id)),
    [articles, id],
  );

  // Build ordered flat list for prev/next
  const orderedArticles = useMemo(() => {
    return categories.flatMap((c) => c.items);
  }, [categories]);

  const currentIndex = useMemo(
    () => orderedArticles.findIndex((a) => a.id === Number(id)),
    [orderedArticles, id],
  );

  const prevArticle = currentIndex > 0 ? orderedArticles[currentIndex - 1] : null;
  const nextArticle =
    currentIndex >= 0 && currentIndex < orderedArticles.length - 1
      ? orderedArticles[currentIndex + 1]
      : null;

  // Related articles = same category, excluding current
  const relatedArticles = useMemo(() => {
    if (!article) return [];
    return articles
      .filter((a) => a.category === article.category && a.id !== article.id)
      .slice(0, 4);
  }, [article, articles]);

  const handleFeedback = useCallback((value: 'yes' | 'no') => {
    setFeedback(value);
  }, []);

  if (!articles.length) {
    return (
      <div className="help-loading">
        <Spinner size="large" accessibilityLabel="Loading article" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="help-empty">
        <h3>Article not found</h3>
        <p>This article may have been removed or the link is incorrect.</p>
      </div>
    );
  }

  const catName = article.category || 'general';

  return (
    <div className="help-article">
      {/* Breadcrumbs */}
      <nav className="help-breadcrumbs">
        <span className="help-breadcrumb-link" onClick={() => navigate('/help')}>
          Help
        </span>
        <span className="help-breadcrumb-sep">›</span>
        <span
          className="help-breadcrumb-link"
          onClick={() => navigate(`/help/category/${categorySlug(catName)}`)}
        >
          {catName}
        </span>
        <span className="help-breadcrumb-sep">›</span>
        <span className="help-breadcrumb-current">
          {article.question.length > 50
            ? article.question.slice(0, 50) + '…'
            : article.question}
        </span>
      </nav>

      {/* Header */}
      <div className="help-article-header">
        <span className="help-article-category-badge">{catName}</span>
        <h1 className="help-article-title">{article.question}</h1>
        <p className="help-article-meta">
          Last updated{' '}
          {new Date(article.updated_at).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* Body */}
      <div className="help-article-body">{renderArticleContent(article.answer || '')}</div>

      {/* Feedback */}
      <div className="help-feedback">
        <p className="help-feedback-title">Was this article helpful?</p>
        {feedback ? (
          <p className="help-feedback-thanks">Thanks for your feedback!</p>
        ) : (
          <div className="help-feedback-buttons">
            <button className="help-feedback-btn" onClick={() => handleFeedback('yes')}>
              👍 Yes
            </button>
            <button className="help-feedback-btn" onClick={() => handleFeedback('no')}>
              👎 No
            </button>
          </div>
        )}
      </div>

      {/* Related Articles */}
      {relatedArticles.length > 0 && (
        <div className="help-related">
          <h3 className="help-related-title">Related Articles</h3>
          <div className="help-related-list">
            {relatedArticles.map((a) => (
              <div
                key={a.id}
                className="help-related-link"
                onClick={() => navigate(`/help/article/${a.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/help/article/${a.id}`);
                }}
              >
                → {a.question}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prev / Next */}
      <nav className="help-article-nav">
        {prevArticle ? (
          <div
            className="help-article-nav-btn prev"
            onClick={() => navigate(`/help/article/${prevArticle.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate(`/help/article/${prevArticle.id}`);
            }}
          >
            <span className="help-article-nav-label">← Previous</span>
            <span className="help-article-nav-title">{prevArticle.question}</span>
          </div>
        ) : (
          <div />
        )}
        {nextArticle ? (
          <div
            className="help-article-nav-btn next"
            onClick={() => navigate(`/help/article/${nextArticle.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate(`/help/article/${nextArticle.id}`);
            }}
          >
            <span className="help-article-nav-label">Next →</span>
            <span className="help-article-nav-title">{nextArticle.question}</span>
          </div>
        ) : (
          <div />
        )}
      </nav>
    </div>
  );
};

export default HelpArticlePage;
