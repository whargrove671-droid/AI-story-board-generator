import { z } from 'zod';

export const StoryLengthEnum = z.union([
  z.literal(5),
  z.literal(40),
  z.literal(120),
]);

export const GenerateStorySchema = z.object({
  storyId: z.string().uuid('Invalid story ID format'),
  storyIdea: z.string().min(1, 'Story directive cannot be empty').max(5000, 'Story directive is too long'),
  storyLength: z.coerce.number().pipe(StoryLengthEnum).default(5),
});

export const CompileVideoSchema = z.object({
  storyId: z.string().uuid('Invalid story ID format'),
});

export const GenerateAudioSchema = z.object({
  storyId: z.string().uuid('Invalid story ID format'),
});

export const GenerateImagesSchema = z.object({
  storyId: z.string().uuid('Invalid story ID format'),
  sceneId: z.string().uuid('Invalid scene ID format').optional(),
  retryFailed: z.boolean().optional().default(false),
});

export const YouTubeExtractSchema = z.object({
  storyId: z.string().uuid('Invalid story ID format'),
  youtubeUrl: z.string().url('Invalid YouTube URL format').max(500),
});

export const YouTubeUploadSchema = z.object({
  storyId: z.string().uuid('Invalid story ID format'),
  channelType: z.enum(['main', 'sub']).default('main'),
});
