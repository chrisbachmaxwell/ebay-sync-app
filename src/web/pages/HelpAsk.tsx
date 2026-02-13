import React, { useCallback, useState } from 'react';
import {
  BlockStack,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../hooks/useApi';

const CATEGORY_OPTIONS = [
  { label: 'Select a category…', value: '' },
  { label: 'Getting Started', value: 'Getting Started' },
  { label: 'Products', value: 'products' },
  { label: 'Mappings', value: 'mappings' },
  { label: 'Pipeline', value: 'pipeline' },
  { label: 'Orders', value: 'orders' },
  { label: 'Analytics', value: 'analytics' },
  { label: 'Chat', value: 'chat' },
  { label: 'General', value: 'general' },
];

const HelpAsk: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState('');
  const [askedBy, setAskedBy] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: (body: { question: string; asked_by?: string; category?: string }) =>
      apiClient.post('/help/questions', body),
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['help-articles-all'] });
    },
  });

  const handleSubmit = useCallback(() => {
    if (!question.trim()) return;
    submitMutation.mutate({
      question: question.trim(),
      ...(askedBy.trim() ? { asked_by: askedBy.trim() } : {}),
      ...(category ? { category } : {}),
    });
  }, [question, askedBy, category, submitMutation]);

  if (submitted) {
    return (
      <div className="help-ask-page">
        <Card>
          <BlockStack gap="400">
            <Text variant="headingLg" as="h2">
              ✅ Question Submitted!
            </Text>
            <Text as="p">
              Your question has been received. If our AI can answer it, you'll see it in the
              documentation shortly. Otherwise, an admin will review and respond.
            </Text>
            <InlineStack gap="200">
              <Button onClick={() => navigate('/help')}>Back to Help</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setSubmitted(false);
                  setQuestion('');
                  setCategory('');
                  setAskedBy('');
                }}
              >
                Ask Another
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </div>
    );
  }

  return (
    <div className="help-ask-page">
      {/* Breadcrumbs */}
      <nav className="help-breadcrumbs" style={{ marginBottom: 24 }}>
        <span className="help-breadcrumb-link" onClick={() => navigate('/help')}>
          Help
        </span>
        <span className="help-breadcrumb-sep">›</span>
        <span className="help-breadcrumb-current">Ask a Question</span>
      </nav>

      <h2>Ask a Question</h2>
      <p className="help-ask-subtitle">
        Can't find what you're looking for? Submit your question and our AI will try to
        answer it instantly.
      </p>

      <Card>
        <FormLayout>
          <TextField
            label="Your Question"
            value={question}
            onChange={setQuestion}
            multiline={3}
            autoComplete="off"
            requiredIndicator
            placeholder="How do I…?"
          />
          <Select
            label="Category"
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={setCategory}
          />
          <TextField
            label="Your Name (optional)"
            value={askedBy}
            onChange={setAskedBy}
            autoComplete="off"
          />
          <InlineStack gap="200">
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={submitMutation.isPending}
              disabled={!question.trim()}
            >
              Submit Question
            </Button>
            <Button onClick={() => navigate('/help')}>Cancel</Button>
          </InlineStack>
        </FormLayout>
      </Card>
    </div>
  );
};

export default HelpAsk;
