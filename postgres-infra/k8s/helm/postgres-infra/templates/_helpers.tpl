{{/*
Полное имя релиза.
*/}}
{{- define "postgres-infra.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Стандартные лейблы Helm-чарта.
*/}}
{{- define "postgres-infra.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{ include "postgres-infra.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Лейблы для selector и matchLabels.
*/}}
{{- define "postgres-infra.selectorLabels" -}}
app.kubernetes.io/name: {{ include "postgres-infra.fullname" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app: {{ include "postgres-infra.fullname" . }}
{{- end }}
