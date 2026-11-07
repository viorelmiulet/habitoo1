import ts from 'typescript';
import {readFileSync,writeFileSync} from 'node:fs';
import {publicationSchema,leadSchema,messageSchema,statsSchema} from '../src/lib/partner-api/write.server';
import {TAXONOMIES,sandboxId as unused} from '../src/lib/partner-api/schema';
