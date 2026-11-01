import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTags,updateImageTags,matchesGalleryImage,libraryImages} from './gallery-tags.js';

test('tag input handles multiple separators and deduplicates case-insensitively',()=>{
  assert.deepEqual(normalizeTags(' 角色, #靈感，角色\nART, art '),['角色','靈感','ART']);
  assert.deepEqual(normalizeTags(undefined),[]);
});

test('library categories combine favorite, tag and description search without mutating records',()=>{
  const images=[{name:'A',tags:['Art'],favorite:true,description:'Warm light',createdAt:1},{name:'B',tags:[],createdAt:3},{name:'C',tags:['Photo'],favorite:true,description:'Winter study',createdAt:2}];
  assert.deepEqual(libraryImages(images,{category:'favorites',tag:'art'}).map(image=>image.name),['A']);
  assert.deepEqual(libraryImages(images,{category:'untagged'}).map(image=>image.name),['B']);
  assert.deepEqual(libraryImages(images,{query:'winter'}).map(image=>image.name),['C']);
  assert.deepEqual(images.map(image=>image.name),['A','B','C']);
});

test('library sorting supports newest, oldest and alphabetical display',()=>{
  const images=[{name:'C',createdAt:2},{name:'A',createdAt:3},{name:'B',createdAt:1}];
  assert.deepEqual(libraryImages(images).map(image=>image.name),['A','C','B']);
  assert.deepEqual(libraryImages(images,{sort:'oldest'}).map(image=>image.name),['B','C','A']);
  assert.deepEqual(libraryImages(images,{sort:'name'}).map(image=>image.name),['A','B','C']);
});

test('batch tag updates preserve existing tags and remove only requested tags',()=>{
  const images=[{id:'a',name:'one',tags:['Existing','Art']},{id:'b',name:'two'}];
  const updates=images.map(image=>updateImageTags(image,'art, New'));
  assert.deepEqual(updates.map(image=>image.tags),[['Existing','Art','New'],['art','New']]);
  assert.deepEqual(images[0].tags,['Existing','Art']);
  assert.deepEqual(updateImageTags(updates[0],'ART',true).tags,['Existing','New']);
  assert.throws(()=>updateImageTags(images[0],'a'.repeat(41)));
  assert.throws(()=>updateImageTags({},Array.from({length:31},(_,i)=>String(i))));
});

test('search and tag filters combine and accept legacy untagged images',()=>{
  const image={name:'Portrait.png',tags:['角色','Art']};
  assert.equal(matchesGalleryImage(image,'角色','art'),true);
  assert.equal(matchesGalleryImage(image,'portrait','角色'),true);
  assert.equal(matchesGalleryImage(image,'portrait','other'),false);
  assert.equal(matchesGalleryImage({name:'old.png'},'old'),true);
  assert.equal(matchesGalleryImage({name:'old.png'},'','Art'),false);
});
