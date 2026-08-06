package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	webSearchTimeout        = 20 * time.Second
	webSearchMaxResponse    = 2 << 20
	webFetchDefaultMaxBytes = 60000
	webFetchMaxBytes        = 200000
	webSearchUserAgent      = "WindyPearConnector/0.1 (+https://windypear.ai)"
)

var (
	duckHTMLResultRe  = regexp.MustCompile(`(?is)<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)</a>`)
	duckHTMLSnippetRe = regexp.MustCompile(`(?is)<a[^>]+class="[^"]*\bresult__snippet\b[^"]*"[^>]*>(.*?)</a>`)
	bingHTMLItemRe    = regexp.MustCompile(`(?is)<li[^>]+class="[^"]*\bb_algo\b[^"]*"[^>]*>.*?</li>`)
	bingHTMLLinkRe    = regexp.MustCompile(`(?is)<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>`)
	bingHTMLSnippetRe = regexp.MustCompile(`(?is)<p[^>]*>(.*?)</p>`)
	googleHTMLRe      = regexp.MustCompile(`(?is)<a[^>]+href="([^"]+)"[^>]*>\s*(?:<div[^>]*>\s*)?<h3[^>]*>(.*?)</h3>`)
	baiduHTMLRe       = regexp.MustCompile(`(?is)<h3[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>\s*</h3>`)
	htmlTitleRe       = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	htmlDropBlockRe   = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>|<style[^>]*>.*?</style>|<noscript[^>]*>.*?</noscript>|<svg[^>]*>.*?</svg>|<canvas[^>]*>.*?</canvas>|<template[^>]*>.*?</template>`)
	htmlBlockBreakRe  = regexp.MustCompile(`(?i)<\s*/?\s*(br|p|div|section|article|header|footer|main|li|ul|ol|tr|table|h[1-6]|blockquote)\b[^>]*>`)
	htmlTagRe         = regexp.MustCompile(`(?is)<[^>]+>`)
	htmlWhitespaceRe  = regexp.MustCompile(`\s+`)
	lineWhitespaceRe  = regexp.MustCompile(`[ \t\f\v]+`)
)

type searchResult struct {
	Title   string
	URL     string
	Snippet string
}

func webSearch(query string, maxResults int, language string, region string, timeRange string, engine string) (string, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return "", errors.New("query is required")
	}
	maxResults = clampInt(maxResults, 1, 10, 5)
	engine = normalizeSearchEngine(engine)
	if engine == "auto" {
		var lastErr error
		for _, candidate := range autoSearchEngines(language, region) {
			results, warning, err := runSearchEngine(candidate, query, maxResults, language, region, timeRange)
			if len(results) > 0 {
				return formatSearchResults(query, candidate, results, warning), nil
			}
			if err != nil {
				lastErr = err
			}
		}
		if lastErr != nil {
			return "", lastErr
		}
		return "No search results found.", nil
	}

	results, warning, err := runSearchEngine(engine, query, maxResults, language, region, timeRange)
	if len(results) > 0 {
		return formatSearchResults(query, engine, results, warning), nil
	}
	if err != nil {
		return "", err
	}
	return "No search results found.", nil
}

func runSearchEngine(engine string, query string, maxResults int, language string, region string, timeRange string) ([]searchResult, error, error) {
	switch engine {
	case "duckduckgo":
		return duckDuckGoSearch(query, maxResults, language, region, timeRange)
	case "bing":
		results, err := bingSearch(query, maxResults, language, region, timeRange)
		return results, nil, err
	case "google":
		results, err := googleSearch(query, maxResults, language, region, timeRange)
		return results, nil, err
	case "baidu":
		results, err := baiduSearch(query, maxResults)
		return results, nil, err
	default:
		return nil, nil, fmt.Errorf("unsupported search engine %q", engine)
	}
}

func duckDuckGoSearch(query string, maxResults int, language string, region string, timeRange string) ([]searchResult, error, error) {
	results, err := duckDuckGoInstantSearch(query, maxResults, language, region)
	if err == nil && len(results) > 0 {
		return results, nil, nil
	}
	htmlResults, htmlErr := duckDuckGoHTMLSearch(query, maxResults, language, region, timeRange)
	if len(htmlResults) > 0 {
		if err != nil {
			return htmlResults, err, nil
		}
		return htmlResults, htmlErr, nil
	}
	if htmlErr != nil {
		return nil, nil, htmlErr
	}
	if err != nil {
		return nil, nil, err
	}
	return nil, nil, nil
}

func duckDuckGoInstantSearch(query string, maxResults int, language string, region string) ([]searchResult, error) {
	params := url.Values{}
	params.Set("q", query)
	params.Set("format", "json")
	params.Set("no_html", "1")
	params.Set("skip_disambig", "1")
	if kl := duckDuckGoLocale(language, region); kl != "" {
		params.Set("kl", kl)
	}
	raw, err := fetchSearchURL("https://api.duckduckgo.com/?" + params.Encode())
	if err != nil {
		return nil, err
	}
	var payload struct {
		Abstract       string `json:"AbstractText"`
		AbstractSource string `json:"AbstractSource"`
		AbstractURL    string `json:"AbstractURL"`
		Heading        string `json:"Heading"`
		Results        []struct {
			FirstURL string `json:"FirstURL"`
			Text     string `json:"Text"`
		} `json:"Results"`
		RelatedTopics []json.RawMessage `json:"RelatedTopics"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	results := []searchResult{}
	if payload.AbstractURL != "" && payload.Abstract != "" {
		title := payload.Heading
		if title == "" {
			title = payload.AbstractSource
		}
		results = append(results, searchResult{Title: title, URL: payload.AbstractURL, Snippet: payload.Abstract})
	}
	for _, result := range payload.Results {
		results = append(results, searchResultFromDuckText(result.Text, result.FirstURL))
	}
	for _, rawTopic := range payload.RelatedTopics {
		collectDuckRelatedTopic(rawTopic, &results, maxResults)
		if len(results) >= maxResults {
			break
		}
	}
	return dedupeSearchResults(results, maxResults), nil
}

func collectDuckRelatedTopic(raw json.RawMessage, results *[]searchResult, maxResults int) {
	if len(*results) >= maxResults {
		return
	}
	var topic struct {
		FirstURL string            `json:"FirstURL"`
		Text     string            `json:"Text"`
		Topics   []json.RawMessage `json:"Topics"`
	}
	if err := json.Unmarshal(raw, &topic); err != nil {
		return
	}
	if topic.FirstURL != "" && topic.Text != "" {
		*results = append(*results, searchResultFromDuckText(topic.Text, topic.FirstURL))
	}
	for _, nested := range topic.Topics {
		collectDuckRelatedTopic(nested, results, maxResults)
		if len(*results) >= maxResults {
			return
		}
	}
}

func searchResultFromDuckText(text string, rawURL string) searchResult {
	title, snippet, _ := strings.Cut(strings.TrimSpace(text), " - ")
	if strings.TrimSpace(snippet) == "" {
		snippet = title
	}
	return searchResult{Title: title, URL: rawURL, Snippet: snippet}
}

func duckDuckGoHTMLSearch(query string, maxResults int, language string, region string, timeRange string) ([]searchResult, error) {
	params := url.Values{}
	params.Set("q", query)
	if kl := duckDuckGoLocale(language, region); kl != "" {
		params.Set("kl", kl)
	}
	if df := duckDuckGoTimeRange(timeRange); df != "" {
		params.Set("df", df)
	}
	raw, err := fetchSearchURL("https://duckduckgo.com/html/?" + params.Encode())
	if err != nil {
		return nil, err
	}
	body := string(raw)
	matches := duckHTMLResultRe.FindAllStringSubmatch(body, maxResults)
	snippets := duckHTMLSnippetRe.FindAllStringSubmatch(body, maxResults)
	results := make([]searchResult, 0, len(matches))
	for index, match := range matches {
		result := searchResult{
			Title: cleanHTMLText(match[2]),
			URL:   normalizeDuckDuckGoResultURL(match[1]),
		}
		if index < len(snippets) {
			result.Snippet = cleanHTMLText(snippets[index][1])
		}
		results = append(results, result)
	}
	return dedupeSearchResults(results, maxResults), nil
}

func bingSearch(query string, maxResults int, language string, region string, timeRange string) ([]searchResult, error) {
	params := url.Values{}
	params.Set("q", query)
	params.Set("count", fmt.Sprintf("%d", maxResults))
	if language = strings.TrimSpace(language); language != "" {
		params.Set("setlang", language)
	}
	if region = strings.TrimSpace(region); region != "" {
		params.Set("cc", strings.ToLower(region))
	}
	if filters := bingTimeRange(timeRange); filters != "" {
		params.Set("filters", filters)
	}
	raw, err := fetchSearchURL("https://www.bing.com/search?" + params.Encode())
	if err != nil {
		return nil, err
	}
	items := bingHTMLItemRe.FindAllString(string(raw), maxResults*2)
	results := make([]searchResult, 0, len(items))
	for _, item := range items {
		link := bingHTMLLinkRe.FindStringSubmatch(item)
		if len(link) < 3 {
			continue
		}
		result := searchResult{
			Title: cleanHTMLText(link[2]),
			URL:   html.UnescapeString(strings.TrimSpace(link[1])),
		}
		if snippet := bingHTMLSnippetRe.FindStringSubmatch(item); len(snippet) >= 2 {
			result.Snippet = cleanHTMLText(snippet[1])
		}
		results = append(results, result)
	}
	return dedupeSearchResults(results, maxResults), nil
}

func googleSearch(query string, maxResults int, language string, region string, timeRange string) ([]searchResult, error) {
	params := url.Values{}
	params.Set("q", query)
	params.Set("num", fmt.Sprintf("%d", maxResults))
	if language = strings.TrimSpace(language); language != "" {
		params.Set("hl", language)
	}
	if region = strings.TrimSpace(region); region != "" {
		params.Set("gl", strings.ToLower(region))
	}
	if tbs := googleTimeRange(timeRange); tbs != "" {
		params.Set("tbs", tbs)
	}
	raw, err := fetchSearchURL("https://www.google.com/search?" + params.Encode())
	if err != nil {
		return nil, err
	}
	matches := googleHTMLRe.FindAllStringSubmatch(string(raw), maxResults*3)
	results := make([]searchResult, 0, len(matches))
	for _, match := range matches {
		target := normalizeGoogleResultURL(match[1])
		if !strings.HasPrefix(target, "http://") && !strings.HasPrefix(target, "https://") {
			continue
		}
		results = append(results, searchResult{
			Title:   cleanHTMLText(match[2]),
			URL:     target,
			Snippet: "",
		})
	}
	return dedupeSearchResults(results, maxResults), nil
}

func baiduSearch(query string, maxResults int) ([]searchResult, error) {
	params := url.Values{}
	params.Set("wd", query)
	params.Set("rn", fmt.Sprintf("%d", maxResults))
	raw, err := fetchSearchURL("https://www.baidu.com/s?" + params.Encode())
	if err != nil {
		return nil, err
	}
	matches := baiduHTMLRe.FindAllStringSubmatch(string(raw), maxResults*2)
	results := make([]searchResult, 0, len(matches))
	for _, match := range matches {
		results = append(results, searchResult{
			Title:   cleanHTMLText(match[2]),
			URL:     html.UnescapeString(strings.TrimSpace(match[1])),
			Snippet: "",
		})
	}
	return dedupeSearchResults(results, maxResults), nil
}

func webFetch(rawURL string, maxBytes int) (string, error) {
	targetURL, err := normalizeFetchURL(rawURL)
	if err != nil {
		return "", err
	}
	maxBytes = clampInt(maxBytes, 1000, webFetchMaxBytes, webFetchDefaultMaxBytes)
	body, finalURL, status, contentType, truncated, err := fetchWebURL(targetURL, maxBytes)
	if err != nil {
		return "", err
	}
	text := strings.ToValidUTF8(string(body), "")
	title := ""
	content := ""
	if looksLikeHTML(contentType, text) {
		title = extractHTMLTitle(text)
		content = extractReadableHTMLText(text)
	} else {
		content = cleanFetchedText(text)
	}
	if content == "" {
		content = "(empty response)"
	}

	var builder strings.Builder
	fmt.Fprintf(&builder, "Fetched URL: %s\n", targetURL)
	if finalURL != "" && finalURL != targetURL {
		fmt.Fprintf(&builder, "Final URL: %s\n", finalURL)
	}
	if status != "" {
		fmt.Fprintf(&builder, "Status: %s\n", status)
	}
	if contentType != "" {
		fmt.Fprintf(&builder, "Content-Type: %s\n", contentType)
	}
	if title != "" {
		fmt.Fprintf(&builder, "Title: %s\n", title)
	}
	fmt.Fprintf(&builder, "\nContent:\n%s", content)
	if truncated {
		builder.WriteString("\n\n...(truncated)")
	}
	return strings.TrimSpace(builder.String()), nil
}

func fetchSearchURL(rawURL string) ([]byte, error) {
	client := http.Client{Timeout: webSearchTimeout}
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json,text/html;q=0.9,*/*;q=0.8")
	req.Header.Set("User-Agent", webSearchUserAgent)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= http.StatusBadRequest {
		preview, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("search provider returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(preview)))
	}
	return io.ReadAll(io.LimitReader(resp.Body, webSearchMaxResponse))
}

func fetchWebURL(rawURL string, maxBytes int) ([]byte, string, string, string, bool, error) {
	client := http.Client{Timeout: webSearchTimeout}
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", "", "", false, err
	}
	req.Header.Set("Accept", "text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("User-Agent", webSearchUserAgent)
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", "", "", false, err
	}
	defer resp.Body.Close()
	limit := int64(maxBytes) + 1
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, limit))
	if readErr != nil {
		return nil, "", resp.Status, resp.Header.Get("Content-Type"), false, readErr
	}
	truncated := len(body) > maxBytes
	if truncated {
		body = body[:maxBytes]
	}
	if resp.StatusCode >= http.StatusBadRequest {
		preview := truncateRunes(strings.ToValidUTF8(string(body), ""), 1024)
		return nil, "", resp.Status, resp.Header.Get("Content-Type"), truncated, fmt.Errorf("web fetch returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(preview))
	}
	finalURL := ""
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = resp.Request.URL.String()
	}
	return body, finalURL, resp.Status, resp.Header.Get("Content-Type"), truncated, nil
}

func normalizeFetchURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errors.New("url is required")
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if parsed.Scheme == "" {
		parsed, err = url.Parse("https://" + raw)
		if err != nil {
			return "", err
		}
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("url must use http or https")
	}
	if strings.TrimSpace(parsed.Host) == "" {
		return "", errors.New("url host is required")
	}
	parsed.Fragment = ""
	return parsed.String(), nil
}

func duckDuckGoLocale(language string, region string) string {
	language = strings.ToLower(strings.TrimSpace(language))
	region = strings.ToLower(strings.TrimSpace(region))
	if language == "" && region == "" {
		return ""
	}
	if strings.Contains(language, "-") {
		return language
	}
	if language == "" {
		language = "wt-wt"
	}
	if region == "" || language == "wt-wt" {
		return language
	}
	return region + "-" + language
}

func duckDuckGoTimeRange(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "day", "d":
		return "d"
	case "week", "w":
		return "w"
	case "month", "m":
		return "m"
	case "year", "y":
		return "y"
	default:
		return ""
	}
}

func normalizeDuckDuckGoResultURL(raw string) string {
	raw = html.UnescapeString(strings.TrimSpace(raw))
	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	if parsed.Host == "duckduckgo.com" && parsed.Path == "/l/" {
		if target := parsed.Query().Get("uddg"); target != "" {
			return target
		}
	}
	return raw
}

func normalizeSearchEngine(engine string) string {
	switch strings.ToLower(strings.TrimSpace(engine)) {
	case "", "auto":
		return "auto"
	case "duckduckgo", "duck", "ddg":
		return "duckduckgo"
	case "bing", "microsoft":
		return "bing"
	case "baidu":
		return "baidu"
	case "google":
		return "google"
	default:
		return strings.ToLower(strings.TrimSpace(engine))
	}
}

func autoSearchEngines(language string, region string) []string {
	language = strings.ToLower(strings.TrimSpace(language))
	region = strings.ToLower(strings.TrimSpace(region))
	if strings.HasPrefix(language, "zh") || region == "cn" {
		return []string{"duckduckgo", "bing", "baidu", "google"}
	}
	return []string{"duckduckgo", "bing", "google", "baidu"}
}

func bingTimeRange(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "day", "d":
		return `ex1:"ez1"`
	case "week", "w":
		return `ex1:"ez2"`
	case "month", "m":
		return `ex1:"ez3"`
	default:
		return ""
	}
}

func googleTimeRange(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "day", "d":
		return "qdr:d"
	case "week", "w":
		return "qdr:w"
	case "month", "m":
		return "qdr:m"
	case "year", "y":
		return "qdr:y"
	default:
		return ""
	}
}

func normalizeGoogleResultURL(raw string) string {
	raw = html.UnescapeString(strings.TrimSpace(raw))
	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	if parsed.Path == "/url" {
		if target := parsed.Query().Get("q"); target != "" {
			return target
		}
	}
	return raw
}

func looksLikeHTML(contentType string, body string) bool {
	contentType = strings.ToLower(contentType)
	return strings.Contains(contentType, "html") ||
		strings.Contains(strings.ToLower(body[:minInt(len(body), 512)]), "<html") ||
		strings.Contains(strings.ToLower(body[:minInt(len(body), 512)]), "<!doctype html")
}

func extractHTMLTitle(body string) string {
	match := htmlTitleRe.FindStringSubmatch(body)
	if len(match) < 2 {
		return ""
	}
	return truncateRunes(cleanHTMLText(match[1]), 200)
}

func extractReadableHTMLText(body string) string {
	body = htmlDropBlockRe.ReplaceAllString(body, " ")
	body = htmlBlockBreakRe.ReplaceAllString(body, "\n")
	body = htmlTagRe.ReplaceAllString(body, " ")
	body = html.UnescapeString(body)
	return cleanFetchedText(body)
}

func cleanFetchedText(value string) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	value = strings.ReplaceAll(value, "\r", "\n")
	lines := strings.Split(value, "\n")
	cleaned := make([]string, 0, len(lines))
	blank := false
	for _, line := range lines {
		line = strings.TrimSpace(lineWhitespaceRe.ReplaceAllString(line, " "))
		if line == "" {
			if !blank && len(cleaned) > 0 {
				cleaned = append(cleaned, "")
			}
			blank = true
			continue
		}
		cleaned = append(cleaned, line)
		blank = false
	}
	return strings.TrimSpace(strings.Join(cleaned, "\n"))
}

func cleanHTMLText(value string) string {
	value = htmlTagRe.ReplaceAllString(value, " ")
	value = html.UnescapeString(value)
	value = htmlWhitespaceRe.ReplaceAllString(value, " ")
	return strings.TrimSpace(value)
}

func dedupeSearchResults(results []searchResult, maxResults int) []searchResult {
	filtered := make([]searchResult, 0, len(results))
	seen := map[string]bool{}
	for _, result := range results {
		result.Title = truncateRunes(strings.TrimSpace(result.Title), 160)
		result.URL = strings.TrimSpace(result.URL)
		result.Snippet = truncateRunes(strings.TrimSpace(result.Snippet), 500)
		if result.URL == "" || result.Title == "" || seen[result.URL] {
			continue
		}
		seen[result.URL] = true
		filtered = append(filtered, result)
		if len(filtered) >= maxResults {
			break
		}
	}
	return filtered
}

func formatSearchResults(query string, engine string, results []searchResult, providerErr error) string {
	if len(results) == 0 {
		if providerErr != nil {
			return "No search results found.\n\nProvider error: " + providerErr.Error()
		}
		return "No search results found."
	}
	var builder strings.Builder
	fmt.Fprintf(&builder, "Search results for %q using %s:\n", query, engine)
	for index, result := range results {
		fmt.Fprintf(&builder, "\n%d. %s\n%s", index+1, result.Title, result.URL)
		if result.Snippet != "" {
			fmt.Fprintf(&builder, "\n%s", result.Snippet)
		}
		builder.WriteString("\n")
	}
	if providerErr != nil {
		fmt.Fprintf(&builder, "\nNote: fallback search was used after provider error: %s\n", providerErr.Error())
	}
	return strings.TrimSpace(builder.String())
}

func minInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}

func clampInt(value int, min int, max int, fallback int) int {
	if value == 0 {
		return fallback
	}
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func truncateRunes(value string, max int) string {
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return string(runes[:max]) + "..."
}
